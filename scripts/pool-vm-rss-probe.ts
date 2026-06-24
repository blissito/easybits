/**
 * Sonda de RAM real de un claude-worker — para dimensionar vmMemMb / concurrencia.
 *
 * Spawnea UNA VM claude-worker, dispara N turnos CONCURRENTES (cada uno su
 * sessionId → su subproceso claude) golpeando localhost:3000/message DENTRO de la
 * VM, y muestrea `free -m` + top RSS mientras corren. Reporta:
 *   - RAM baseline (VM idle, runtime arriba)
 *   - RAM pico con N turnos activos
 *   - estimado por turno = (pico - baseline) / N
 *   - top procesos por RSS en el pico
 *
 * Run: cd /Users/bliss/easybits && npx tsx scripts/pool-vm-rss-probe.ts [memMb] [nTurns]
 *   ej. npx tsx scripts/pool-vm-rss-probe.ts 2048 2
 *
 * Destruye la VM al final (incl. en error).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { db } from "../app/.server/db";
import type { AuthContext } from "../app/.server/apiAuth";
import { createAgent, execCommand, destroySandbox } from "../app/.server/core/sandboxOperations";

const MEM_MB = Number(process.argv[2] || 2048);
const N_TURNS = Number(process.argv[3] || 2);
const OWNER_EMAIL = process.env.MEMTEST_OWNER_EMAIL || "fixtergeek@gmail.com";

const log = (...a: unknown[]) => console.log(...a);

async function sh(ctx: AuthContext, sandboxId: string, command: string, timeoutSeconds = 20) {
  const r = await execCommand(ctx, sandboxId, { command, timeoutSeconds });
  return (r as any).stdout as string;
}

// MemTotal/MemAvailable de /proc/meminfo → usado real (MB).
async function memUsedMb(ctx: AuthContext, sandboxId: string): Promise<{ total: number; used: number }> {
  const out = await sh(ctx, sandboxId, `awk '/MemTotal|MemAvailable/{print $2}' /proc/meminfo`, 10);
  const [total, avail] = out.trim().split("\n").map((n) => Math.round(Number(n) / 1024));
  return { total, used: total - avail };
}

async function topRss(ctx: AuthContext, sandboxId: string): Promise<string> {
  return (await sh(ctx, sandboxId, `ps -eo rss,comm --sort=-rss 2>/dev/null | head -6`, 10)).trim();
}

async function main() {
  const user = await db.user.findFirst({ where: { email: OWNER_EMAIL } });
  if (!user) throw new Error(`owner ${OWNER_EMAIL} no encontrado`);
  const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE"] };

  let vm: { agentId: string; sandboxId: string } | null = null;
  try {
    log(`\n⏳ spawneando claude-worker @ ${MEM_MB}MB / ${MEM_MB <= 512 ? 1 : 2}vCPU…`);
    const created = await createAgent(ctx, {
      template: "claude-worker" as any,
      env: {},
      name: "rss-probe",
      memoryMb: MEM_MB,
      vcpus: MEM_MB <= 512 ? 1 : 2,
    });
    vm = { agentId: created.agentId, sandboxId: created.sandboxId };
    log(`   sandboxId=${created.sandboxId}`);

    // Esperar a que el runtime escuche en :3000 (health del worker).
    const deadline = Date.now() + 180_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const h = await sh(ctx, created.sandboxId, `curl -s --max-time 3 localhost:3000/health || true`, 10);
        if (h.includes('"ok":true')) {
          ready = true;
          log(`   ✅ worker arriba: ${h.trim()}`);
          break;
        }
      } catch { /* aún booteando */ }
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (!ready) throw new Error("worker no levantó :3000/health en 180s");

    const base = await memUsedMb(ctx, created.sandboxId);
    log(`\n📊 baseline (idle): ${base.used}MB / ${base.total}MB`);

    // Disparar N turnos concurrentes (cada uno su sessionId → su subproceso claude).
    // curl en background DENTRO de la VM; el SSE se descarta a /tmp.
    const sids = Array.from({ length: N_TURNS }, () => randomUUID());
    const fire = sids
      .map(
        (sid, i) =>
          `curl -sN --max-time 90 -X POST localhost:3000/message ` +
          `-H 'content-type: application/json' ` +
          `-d '{"content":"Escribe un párrafo corto contando hasta diez, turno ${i + 1}.","sessionId":"${sid}"}' ` +
          `> /tmp/turn${i}.out 2>&1 &`,
      )
      .join(" ");
    log(`\n🔥 disparando ${N_TURNS} turnos concurrentes…`);
    await sh(ctx, created.sandboxId, `${fire} echo started`, 15);

    // Muestrear ~70s buscando el pico.
    let peak = base.used;
    let peakTop = "";
    const sampleEnd = Date.now() + 70_000;
    while (Date.now() < sampleEnd) {
      const m = await memUsedMb(ctx, created.sandboxId).catch(() => null);
      if (m && m.used > peak) {
        peak = m.used;
        peakTop = await topRss(ctx, created.sandboxId).catch(() => "");
      }
      if (m) process.stdout.write(`\r   usado: ${m.used}MB (pico ${peak}MB)   `);
      // ¿ya terminaron los turnos? (no quedan procesos claude)
      const procs = await sh(ctx, created.sandboxId, `pgrep -fc 'claude' || echo 0`, 10).catch(() => "1");
      if (Number(procs.trim()) === 0 && Date.now() > sampleEnd - 50_000) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    log("");

    // Revisar que los turnos sí respondieron (no OOM/auth fail).
    const outs = await sh(ctx, created.sandboxId, `for f in /tmp/turn*.out; do echo "== $f =="; head -c 300 "$f"; echo; done`, 15).catch(() => "");

    const delta = peak - base.used;
    log(`\n════════ RESULTADO (${MEM_MB}MB, ${N_TURNS} turnos) ════════`);
    log(`baseline:        ${base.used}MB`);
    log(`pico:            ${peak}MB / ${base.total}MB  (${Math.round((peak / base.total) * 100)}%)`);
    log(`delta N turnos:  ${delta}MB`);
    log(`≈ por turno:      ${Math.round(delta / N_TURNS)}MB`);
    log(`top RSS en pico:\n${peakTop}`);
    log(`\nsalida de turnos (primeros bytes):\n${outs}`);
  } finally {
    if (vm) {
      await destroySandbox(ctx, vm.sandboxId).catch(() => {});
      await db.agent.delete({ where: { id: vm.agentId } }).catch(() => {});
      log(`\n🧹 destruida ${vm.sandboxId}`);
    }
    await db.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error("\n💥", e);
  process.exit(1);
});
