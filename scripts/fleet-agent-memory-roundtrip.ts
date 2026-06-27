/**
 * End-to-end test del restore de memoria del FleetAgent (fleetAgentOperations).
 *
 * Verifica el round-trip que NO estaba probado: tar en la VM → readFile base64 →
 * S3 → getReadUrl → fetch → writeFile base64 → untar en una VM FRESCA, con
 * fidelidad byte-a-byte (sha256). Simula exactamente lo que hace el reaper al
 * DESTRUIR una VM y lo que hace pickOrSpawn al levantar otra para el mismo grupo.
 *
 * Usa las funciones REALES (backupConversation/restoreConversation), no réplicas.
 *
 * Run: cd /Users/bliss/easybits && npx tsx scripts/fleet-memory-roundtrip.ts
 *
 * Spawnea 2 VMs throwaway en el host OVH y las destruye al final (incl. en error).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { db } from "../app/.server/db";
import type { AuthContext } from "../app/.server/apiAuth";
import {
  createAgent,
  execCommand,
  destroySandbox,
} from "../app/.server/core/sandboxOperations";
import {
  backupConversation,
  restoreConversation,
} from "../app/.server/core/fleetAgentOperations";
import { getPlatformDefaultClient } from "../app/.server/storage";

const OWNER_EMAIL = process.env.MEMTEST_OWNER_EMAIL || "fixtergeek@gmail.com";
const TEMPLATE = (process.env.MEMTEST_TEMPLATE || "code-interpreter") as any;
const FLEET_AGENT_ID = "memtest-" + randomUUID().slice(0, 8);
const SESSION_UUID = randomUUID();

// Mismo esquema que fleetAgentOperations: prefix "fleet-memory/", key fleetAgentId/uuid.tgz
const MEM_PREFIX = "fleet-memory/";
const memKey = (fleetAgentId: string, uuid: string) => `${fleetAgentId}/${uuid}.tgz`;
const memClient = () => getPlatformDefaultClient({ prefix: MEM_PREFIX });

function log(...a: unknown[]) {
  console.log(...a);
}

async function spawnReadyVm(ctx: AuthContext, label: string): Promise<{ agentId: string; sandboxId: string }> {
  log(`\n⏳ [${label}] spawneando VM (${TEMPLATE})…`);
  const created = await createAgent(ctx, { template: TEMPLATE, env: {}, name: `memtest-${label}` });
  log(`   agentId=${created.agentId} sandboxId=${created.sandboxId}`);
  // Poll exec readiness directamente (independiente del status "running" del app
  // runtime) — el host /exec funciona en cuanto la microVM bootea.
  const deadline = Date.now() + 150_000;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const r = await execCommand(ctx, created.sandboxId, { command: "echo ready", timeoutSeconds: 10 });
      if ((r as any).stdout?.includes("ready")) {
        log(`   ✅ exec listo`);
        return { agentId: created.agentId, sandboxId: created.sandboxId };
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`[${label}] VM no quedó lista en 150s (último error: ${lastErr})`);
}

// Crea EXACTAMENTE los archivos que el worker real persiste, en las MISMAS rutas
// que backupConversation tar-ea (workspace + transcript project dir bajo /data).
async function seedMemory(ctx: AuthContext, sandboxId: string): Promise<{ contSha: string; jsonlSha: string }> {
  const projDir = `/data/.claude/projects/-data-workspaces-${SESSION_UUID}`;
  const wsDir = `/data/workspaces/${SESSION_UUID}`;
  // .jsonl con UTF-8 multibyte + bytes "raros" para estresar el round-trip base64.
  const seed = [
    `mkdir -p "${wsDir}" "${projDir}"`,
    `printf '%s' "${randomUUID()}" > "${wsDir}/continuation"`,
    // contenido rico: acentos, emoji, comillas, y una línea binaria
    `printf 'línea1: hola ñ áéí 🤖\\nlínea2: "quotes" & <tags>\\n' > "${projDir}/${SESSION_UUID}.jsonl"`,
    `head -c 256 /dev/urandom >> "${projDir}/${SESSION_UUID}.jsonl"`,
    `sha256sum "${wsDir}/continuation" "${projDir}/${SESSION_UUID}.jsonl"`,
  ].join(" && ");
  const r = await execCommand(ctx, sandboxId, { command: seed, timeoutSeconds: 30 });
  const out = (r as any).stdout as string;
  const lines = out.trim().split("\n");
  const contSha = lines[0]?.split(/\s+/)[0] ?? "";
  const jsonlSha = lines[1]?.split(/\s+/)[0] ?? "";
  log(`   seed sha cont=${contSha.slice(0, 12)} jsonl=${jsonlSha.slice(0, 12)}`);
  return { contSha, jsonlSha };
}

async function shasOnVm(ctx: AuthContext, sandboxId: string): Promise<{ contSha: string; jsonlSha: string }> {
  const projDir = `/data/.claude/projects/-data-workspaces-${SESSION_UUID}`;
  const wsDir = `/data/workspaces/${SESSION_UUID}`;
  const r = await execCommand(ctx, sandboxId, {
    command: `sha256sum "${wsDir}/continuation" "${projDir}/${SESSION_UUID}.jsonl" 2>&1`,
    timeoutSeconds: 30,
  });
  const out = (r as any).stdout as string;
  const lines = out.trim().split("\n");
  return { contSha: lines[0]?.split(/\s+/)[0] ?? "", jsonlSha: lines[1]?.split(/\s+/)[0] ?? "" };
}

async function teardownVm(ctx: AuthContext, vm: { agentId: string; sandboxId: string } | null) {
  if (!vm) return;
  try {
    await destroySandbox(ctx, vm.sandboxId);
    await db.agent.delete({ where: { id: vm.agentId } }).catch(() => {});
    log(`   🧹 destruida ${vm.sandboxId}`);
  } catch (e) {
    log(`   ⚠️  no se pudo destruir ${vm.sandboxId}: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  const user = await db.user.findFirst({ where: { email: OWNER_EMAIL } });
  if (!user) throw new Error(`owner ${OWNER_EMAIL} no encontrado`);
  const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE"] };
  log(`Owner: ${user.email} (${user.id})`);
  log(`fleetAgentId=${FLEET_AGENT_ID} sessionUuid=${SESSION_UUID}`);

  let vmA: { agentId: string; sandboxId: string } | null = null;
  let vmB: { agentId: string; sandboxId: string } | null = null;
  let pass = false;

  try {
    // 1. VM A: sembrar memoria + BACKUP
    vmA = await spawnReadyVm(ctx, "A");
    const seeded = await seedMemory(ctx, vmA.sandboxId);

    log(`\n💾 backupConversation…`);
    await backupConversation(ctx, { sandboxId: vmA.sandboxId }, FLEET_AGENT_ID, SESSION_UUID);

    // 2. Verificar blob en S3
    const url = await memClient().getReadUrl(memKey(FLEET_AGENT_ID, SESSION_UUID)).catch(() => null);
    const res = url ? await fetch(url) : null;
    const blobLen = res && res.ok ? (await res.arrayBuffer()).byteLength : 0;
    log(`   blob S3: ${blobLen > 0 ? `✅ ${blobLen} bytes` : "❌ vacío/ausente"}`);
    if (blobLen === 0) throw new Error("BACKUP FALLÓ: blob vacío o ausente en S3");

    // 3. Destruir VM A (simula el reaper aggressive destroy)
    log(`\n🔥 destruyendo VM A (simula reaper destroy)…`);
    await teardownVm(ctx, vmA);
    vmA = null;

    // 4. VM B fresca: RESTORE
    vmB = await spawnReadyVm(ctx, "B");
    log(`\n♻️  restoreConversation en VM fresca…`);
    const restored = await restoreConversation(ctx, { sandboxId: vmB.sandboxId }, FLEET_AGENT_ID, SESSION_UUID);
    log(`   restoreConversation devolvió: ${restored}`);
    if (!restored) throw new Error("RESTORE FALLÓ: devolvió false (blob no encontrado)");

    // 5. Verificar fidelidad byte-a-byte
    const after = await shasOnVm(ctx, vmB.sandboxId);
    const contOk = after.contSha && after.contSha === seeded.contSha;
    const jsonlOk = after.jsonlSha && after.jsonlSha === seeded.jsonlSha;
    log(`\n🔍 fidelidad:`);
    log(`   continuation: ${contOk ? "✅ idéntico" : `❌ ${seeded.contSha.slice(0,12)} != ${after.contSha.slice(0,12)}`}`);
    log(`   .jsonl:       ${jsonlOk ? "✅ idéntico" : `❌ ${seeded.jsonlSha.slice(0,12)} != ${after.jsonlSha.slice(0,12)}`}`);
    pass = Boolean(contOk && jsonlOk);
  } finally {
    log(`\n🧹 cleanup…`);
    await teardownVm(ctx, vmA);
    await teardownVm(ctx, vmB);
    await memClient().deleteObject(memKey(FLEET_AGENT_ID, SESSION_UUID)).catch(() => {});
    log(`   blob S3 borrado`);
    await db.$disconnect().catch(() => {});
  }

  log(`\n${pass ? "✅✅✅ ROUND-TRIP OK — restore de memoria FUNCIONA end-to-end" : "❌ ROUND-TRIP FALLÓ"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("\n💥", e);
  process.exit(1);
});
