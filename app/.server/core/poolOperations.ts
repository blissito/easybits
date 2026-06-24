// Pool manager — the always-on WhatsApp SURFACE that routes inbound group
// messages to a fleet of ephemeral worker Agents (claude-worker / ghosty-gc).
//
// Design (see plan lucky-finding-lecun):
//   - Workers are spawned on demand, multiplex conversations by sessionId=groupId,
//     scale out when full (RAM-gated via /v1/stats), and suspend when idle.
//   - Routing is STICKY per group so the worker's native resume state (the Agent
//     SDK .jsonl transcript on its disk, preserved across suspend/resume) stays
//     coherent. PoolRoute is the sticky map; PoolMessage is the durable log.
//   - Branding/OAuth: pool.persona.env is injected into every worker spawn, so
//     the owner's Max-account OAuth + persona power the whole pool.
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import type { SandboxTemplate } from "~/.server/core/sandboxOperations";
import {
  createAgent,
  suspendSandbox,
  resumeSandbox,
  destroySandbox,
  openAgentChunkStream,
  execCommand,
  readFile,
  writeFile,
  listSandboxes,
} from "~/.server/core/sandboxOperations";
import { getSecretValue } from "~/.server/core/secretOperations";
import { getReservedCapacity } from "~/.server/core/sandboxReservations";
import { getUserPlan, PLANS } from "~/lib/plans";
import { getPlatformDefaultClient } from "~/.server/storage";
import { checkSandboxRateLimit } from "~/.server/rateLimiter";

export class PoolAtCapacity extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PoolAtCapacity";
  }
}

// A chatty group exceeded its per-(pool,group) rate limit. The Baileys surface
// catches this and sends one brief "saturado" notice instead of spawning work.
export class PoolRateLimited extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PoolRateLimited";
  }
}

// ── In-process placement mutex ────────────────────────────────────────────────
// The Baileys surface is single-instance (accepted constraint), so an in-memory
// lock is a correct serialization point. Used to serialize the capacity decision
// (pick free VM / spawn / assign route) per pool so concurrent inbound messages
// from DIFFERENT groups can't both grab the last slot (overcommit → OOM) or
// exceed maxVms. Same Map<key, tail-of-chain> pattern the worker uses internally.
const placeLocks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = placeLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  placeLocks.set(key, tail);
  tail.then(() => {
    if (placeLocks.get(key) === tail) placeLocks.delete(key);
  });
  return next;
}

// ── Externalized conversation memory (S3/Tigris) ─────────────────────────────
// A worker's memory (Agent SDK .jsonl transcript + resume continuation) lives in
// its self-contained workspace dir on the VM disk (/data/workspaces/<sessionUuid>).
// That disk dies when the idle reaper DESTROYS the VM. To make the VM disposable,
// we tar that dir to durable storage on suspend (keyed by sessionUuid) and untar
// it back onto a fresh VM on cold-spawn — so the conversation resumes its memory.
const MEM_PREFIX = "pool-memory/";
const memKey = (poolId: string, sessionUuid: string) => `${poolId}/${sessionUuid}.tgz`;
const memClient = () => getPlatformDefaultClient({ prefix: MEM_PREFIX });

// Tar the conversation's workspace on the VM → upload to storage. Best-effort;
// the caller logs failures (a lost backup just means that conversation starts
// fresh after a destroy — degraded, not broken). Requires the VM running.
export async function backupConversation(
  ctx: AuthContext,
  vm: { sandboxId: string },
  poolId: string,
  sessionUuid: string
): Promise<void> {
  const tgz = `/tmp/${sessionUuid}.tgz`;
  // Two deterministic paths hold the conversation's memory: its workspace dir
  // (cwd + continuation) and the SDK transcript project dir, whose name is the
  // cwd with "/"→"-" (Claude Code convention): /data/workspaces/<uuid> →
  // .claude/projects/-data-workspaces-<uuid>. Tar both, relative to /data.
  const projDir = `.claude/projects/-data-workspaces-${sessionUuid}`;
  await execCommand(ctx, vm.sandboxId, {
    command:
      `cd /data && P="workspaces/${sessionUuid}"; ` +
      `[ -d "${projDir}" ] && P="$P ${projDir}"; ` +
      `tar czf ${tgz} $P 2>/dev/null || true`,
    timeoutSeconds: 60,
  });
  const { content } = await readFile(ctx, vm.sandboxId, { path: tgz, encoding: "base64" });
  if (!content) return; // nothing to back up (workspace not created yet)
  await memClient().putObject(memKey(poolId, sessionUuid), Buffer.from(content, "base64"), "application/gzip");
  await execCommand(ctx, vm.sandboxId, { command: `rm -f ${tgz}`, timeoutSeconds: 15 }).catch(() => {});
}

// Download the conversation's memory blob (if any) and untar it into the VM's
// /data. No-op (returns false) when no blob exists — a brand-new conversation.
export async function restoreConversation(
  ctx: AuthContext,
  vm: { sandboxId: string },
  poolId: string,
  sessionUuid: string
): Promise<boolean> {
  const url = await memClient().getReadUrl(memKey(poolId, sessionUuid)).catch(() => null);
  if (!url) return false;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return false; // missing → fresh conversation
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return false;
  const tgz = `/tmp/${sessionUuid}.tgz`;
  await writeFile(ctx, vm.sandboxId, { path: tgz, content: buf.toString("base64"), encoding: "base64" });
  await execCommand(ctx, vm.sandboxId, {
    command: `mkdir -p /data/workspaces && tar xzf ${tgz} -C /data && rm -f ${tgz}`,
    timeoutSeconds: 60,
  });
  return true;
}

// ── Multi-box seam ──────────────────────────────────────────────────────────
// The pool ingress is box-agnostic; placement is the only box-aware decision.
// SANDBOX_HOSTS = optional CSV of sandbox-host base URLs; defaults to the single
// SANDBOX_HOST_URL. pickHost queries each box's /v1/stats and returns the one
// with the most free RAM that can fit a vmMemMb VM (null if none fits → queue).
// TODO(multi-box): once box B is live, make createSandbox/callHost target the
// returned host (today they use the single SANDBOX_HOST_URL); record it on
// Agent.host so dispatch/suspend resolve the right box.
function hostList(): string[] {
  const csv = process.env.SANDBOX_HOSTS?.trim();
  if (csv) return csv.split(",").map((s) => s.trim()).filter(Boolean);
  const single = process.env.SANDBOX_HOST_URL?.trim();
  return single ? [single] : [];
}

async function pickHost(vmMemMb: number): Promise<{ url: string; freeMb: number } | null> {
  const token = process.env.SANDBOX_HOST_TOKEN || "";
  const stats = await Promise.all(
    hostList().map(async (url) => {
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}/v1/stats`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const s = (await res.json()) as { memUsedMb?: number; memMaxMb?: number };
        const freeMb = (s.memMaxMb ?? 0) - (s.memUsedMb ?? 0);
        return { url, freeMb };
      } catch {
        return null;
      }
    })
  );
  const fit = stats
    .filter((s): s is { url: string; freeMb: number } => !!s && s.freeMb >= vmMemMb)
    .sort((a, b) => b.freeMb - a.freeMb);
  return fit[0] ?? null;
}

type Persona = {
  name?: string;
  env?: Record<string, string>;
  seedFiles?: Array<{ name: string; contentBase64: string }>;
};

type InboundMessage = {
  groupId: string;
  sender?: string;
  text: string;
  mediaUrl?: string;
};

// Build a background AuthContext for a pool's owner. Pool dispatch runs outside
// any HTTP request (reaper, autoscale), so we mint a ctx with full owner scopes.
async function ctxForOwner(ownerId: string): Promise<AuthContext> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  if (!user) throw new Error(`pool owner ${ownerId} not found`);
  return { user, scopes: ["READ", "WRITE", "DELETE"] };
}

// Poll the Agent row until its runtime is fully ready (createAgent brings the
// VM up async, flipping status building → running when it can accept messages).
async function waitAgentRunning(agentId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const row = await db.agent.findUnique({ where: { id: agentId } });
    if (!row) throw new Error(`agent ${agentId} vanished while starting`);
    if (row.status === "running") return row;
    if (row.status === "error") throw new Error(`agent ${agentId} failed to start`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`agent ${agentId} not running after ${timeoutMs}ms`);
}

// Drain a unified {type:"chunk"|"done"|"error"} SSE stream into plain text.
// WhatsApp is non-streaming (one message out), so we collect server-side; this
// also lets us log the full reply as PoolMessage.
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  const consume = (raw: string) => {
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const json = t.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json) as { type?: string; value?: string; message?: string };
        if (evt.type === "chunk" && typeof evt.value === "string") reply += evt.value;
        else if (evt.type === "error") throw new Error(evt.message || "agent stream error");
      } catch (e) {
        if (e instanceof Error && e.message.includes("agent stream")) throw e;
      }
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const nl = buffer.lastIndexOf("\n");
    if (nl >= 0) {
      consume(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);
  return reply.trim();
}

// How many workers (= conversations, sticky routes) a VM currently hosts.
function workersOnVm(agentId: string): Promise<number> {
  return db.poolRoute.count({ where: { agentId } });
}

// Spawn a fresh VM for the pool, branded from persona, RAM-gated.
async function spawnVm(ctx: AuthContext, pool: { id: string; name: string | null; workerTemplate: string; persona: unknown; vmMemMb: number; maxVms: number; oauthSecretName: string | null }) {
  // ── Account sandbox budget (la fuente de verdad, consistente con el HUD) ──
  // El plan da `concurrentSandboxes` y las reservas (add-ons) suman. TODAS las
  // sandboxes del owner en el host consumen este budget — workers de CUALQUIER
  // canal, llamadas livekit, custom, permanentes — no solo los de este pool. Por
  // eso contamos vía listSandboxes (todo el host del owner), no db.agent. El pool
  // NO puede pasarse de aquí: el "X/N sandboxes" del HUD es real, no solo display.
  // (pickHost sigue como gate FÍSICO de RAM; este es el gate LÓGICO de plan.)
  const plan = getUserPlan(ctx.user);
  const reserved = await getReservedCapacity(ctx.user.id).catch(() => ({ machines: 0, agents: 0 }));
  const budget = (PLANS[plan]?.concurrentSandboxes ?? 2) + reserved.machines;
  const hostVms = await listSandboxes(ctx).catch(() => null);
  const inUse = hostVms
    ? hostVms.filter((v) => v.status === "running" || v.status === "starting").length
    : await db.agent.count({ where: { poolId: pool.id, status: { in: ["running", "suspended", "building"] } } });
  if (inUse >= Math.min(budget, pool.maxVms)) {
    throw new PoolAtCapacity(`account at sandbox budget (${inUse}/${budget})`);
  }
  // RAM gate, multi-box aware: pick the box with the most free RAM that fits the
  // VM. null = no box has room → queue. (The host also rejects at create as a
  // backstop.) Single-box today: pickHost returns the only box.
  const target = await pickHost(pool.vmMemMb);
  if (!target) {
    throw new PoolAtCapacity(`no box has ${pool.vmMemMb}MB free`);
  }
  const persona = (pool.persona ?? {}) as Persona;
  const env = { ...(persona.env ?? {}) };
  // Resolve the channel's Claude OAuth from the chosen vault secret (default
  // CLAUDE_CODE_OAUTH_TOKEN) and inject it for claude-worker. Lets different
  // channels use different Max accounts. persona.env wins if it already set it.
  if (!env.CLAUDE_CODE_OAUTH_TOKEN) {
    const secretName = pool.oauthSecretName || "CLAUDE_CODE_OAUTH_TOKEN";
    const oauth = await getSecretValue(ctx.user.id, secretName).catch(() => null);
    if (oauth) env.CLAUDE_CODE_OAUTH_TOKEN = oauth;
  }
  // TODO(multi-box): target.url must drive createSandbox/callHost; today it uses
  // the single SANDBOX_HOST_URL, so target is recorded but not yet routed.
  const created = await createAgent(ctx, {
    template: pool.workerTemplate as SandboxTemplate,
    env,
    name: persona.name ?? `${pool.name ?? "pool"}-worker`,
    seedFiles: persona.seedFiles,
    memoryMb: pool.vmMemMb, // size the VM per the channel's config (e.g. 512MB)
    vcpus: pool.vmMemMb <= 512 ? 1 : 2,
  });
  // Return the BUILDING row immediately — the caller waits for it to come up
  // OUTSIDE the placement lock (so concurrent cold conversations boot in
  // parallel, not serialized behind each other's ~boot time).
  return db.agent.update({
    where: { id: created.agentId },
    data: { poolId: pool.id, lastMessageAt: new Date(), host: target.url },
  });
}

type PoolRow = Awaited<ReturnType<typeof db.pool.findUniqueOrThrow>>;
type AgentRow = NonNullable<Awaited<ReturnType<typeof db.agent.findUnique>>>;

async function ensureRunning(ctx: AuthContext, agent: AgentRow): Promise<AgentRow | null> {
  if (agent.status === "running") return agent;
  if (agent.status === "suspended") {
    await resumeSandbox(ctx, agent.sandboxId);
    await db.agent.update({ where: { id: agent.id }, data: { status: "running" } });
    return waitAgentRunning(agent.id);
  }
  if (agent.status === "building") return waitAgentRunning(agent.id);
  return null; // error/destroyed → caller restores onto a fresh VM
}

// Reserve a VM for `groupId` and claim its slot — the FAST decision only (DB +
// host create-call). Runs under the per-pool placement lock so concurrent cold
// conversations can't both grab the last slot or exceed maxVms. The slow boot
// (waitAgentRunning) and memory restore happen OUTSIDE the lock in pickOrSpawn,
// so N cold conversations boot in parallel instead of serializing.
//   - Counts "building" VMs as candidates so two concurrent placements SHARE a
//     booting VM (up to maxWorkersPerVm) rather than each spawning its own.
type Reservation = { agentId: string; sessionUuid: string; needsRestore: boolean };
async function reserveVm(ctx: AuthContext, pool: PoolRow, groupId: string): Promise<Reservation> {
  const key = { poolId_groupId: { poolId: pool.id, groupId } };
  return withLock(`place:${pool.id}`, async () => {
    const fresh = await db.poolRoute.findUnique({ where: key });

    // Find a VM with a free slot — include "building" so concurrent placements
    // pack onto a booting VM instead of over-spawning. Prefer the route's
    // current VM if it still has a slot (no churn).
    const vms = await db.agent.findMany({
      where: { poolId: pool.id, status: { in: ["running", "building", "suspended"] } },
    });
    let target: AgentRow | null = null;
    if (fresh?.agentId) target = vms.find((v) => v.id === fresh.agentId) ?? null;
    if (!target) {
      for (const vm of vms) {
        if ((await workersOnVm(vm.id)) >= pool.maxWorkersPerVm) continue;
        target = vm;
        break;
      }
    }
    if (!target) target = await spawnVm(ctx, pool); // building row; throws PoolAtCapacity if no room

    // Claim/refresh the route to point at the target, reserving the slot.
    if (fresh) {
      const moved = fresh.agentId !== target.id;
      if (moved) {
        await db.poolRoute.update({ where: { id: fresh.id }, data: { agentId: target.id, detachedAt: null } });
      }
      // Restore when the route was detached (cold) or moved to a different VM.
      return { agentId: target.id, sessionUuid: fresh.sessionUuid, needsRestore: !fresh.agentId || moved };
    }
    const sessionUuid = randomUUID();
    try {
      await db.poolRoute.create({ data: { poolId: pool.id, groupId, agentId: target.id, sessionUuid } });
    } catch {
      const won = await db.poolRoute.findUnique({ where: key }); // adopt the winner
      if (won) return { agentId: won.agentId ?? target.id, sessionUuid: won.sessionUuid, needsRestore: !won.agentId };
      throw new Error(`pool route race for ${groupId} left no winner`);
    }
    return { agentId: target.id, sessionUuid, needsRestore: false };
  });
}

// Resolve the VM that should host the worker for `groupId`. Sticky per group:
//   - warm path (route + running agent): return it, no lock, no wait.
//   - cold path: reserve under the lock (fast), then boot + restore OUTSIDE the
//     lock so concurrent cold conversations come up in parallel.
async function pickOrSpawn(ctx: AuthContext, pool: PoolRow, groupId: string) {
  // 1. Warm path — route with an already-running worker.
  const route = await db.poolRoute.findUnique({ where: { poolId_groupId: { poolId: pool.id, groupId } } });
  if (route?.agentId) {
    const agent = await db.agent.findUnique({ where: { id: route.agentId } });
    if (agent?.status === "running") return { vm: agent, sessionUuid: route.sessionUuid };
  }

  // 2. Cold path — fast reservation under the lock; slow boot/restore outside it.
  const res = await reserveVm(ctx, pool, groupId);
  const reserved = await db.agent.findUniqueOrThrow({ where: { id: res.agentId } });
  const vm = await ensureRunning(ctx, reserved); // waits for boot/resume — in PARALLEL across groups
  if (!vm) throw new Error(`pool worker ${res.agentId} failed to start`);
  if (res.needsRestore) {
    await restoreConversation(ctx, vm, pool.id, res.sessionUuid).catch((e) =>
      console.error(`pool restore ${res.sessionUuid} failed:`, e)
    );
  }
  return { vm, sessionUuid: res.sessionUuid };
}

// Compose the prompt for the worker. Group context: prefix the sender so the
// agent knows who is talking; surface an attached media URL if present.
function formatContent(msg: InboundMessage): string {
  const lines: string[] = [];
  if (msg.sender) lines.push(`[${msg.sender}]`);
  lines.push(msg.text);
  if (msg.mediaUrl) lines.push(`\n(adjunto: ${msg.mediaUrl})`);
  return lines.join(" ").trim();
}

// MAIN ENTRY — the Baileys surface calls this per inbound group message.
// Returns the agent's reply text (to send back to the group).
export async function routeMessage(poolId: string, msg: InboundMessage): Promise<string> {
  const pool = await db.pool.findUniqueOrThrow({ where: { id: poolId } });
  const ctx = await ctxForOwner(pool.ownerId);

  // Per-(pool, group) rate limit so one chatty group can't drain the fleet. This
  // covers BOTH entrypoints (in-process Baileys + HTTP surface) since both land
  // here. The surface turns PoolRateLimited into one brief "saturado" notice.
  const rl = await checkSandboxRateLimit(`${poolId}:${msg.groupId}`, "op");
  if (!rl.allowed) {
    throw new PoolRateLimited(`group ${msg.groupId} rate limited (retry ${rl.retryAfterS}s)`);
  }

  await db.poolMessage.create({
    data: { poolId: pool.id, groupId: msg.groupId, role: "user", sender: msg.sender ?? null, text: msg.text },
  });

  const { vm: worker, sessionUuid } = await pickOrSpawn(ctx, pool, msg.groupId);
  const stream = await openAgentChunkStream(
    {
      agentId: worker.id,
      ownerId: worker.ownerId,
      sandboxId: worker.sandboxId,
      protocol: worker.protocol ?? "sse",
      port: worker.port ?? 3000,
      messagePath: worker.messagePath ?? "/message",
      acpSessionId: worker.acpSessionId,
      acpTransportSessionId: worker.acpTransportSessionId,
      embedToken: worker.embedToken,
      template: worker.template,
    },
    { content: formatContent(msg), sessionId: sessionUuid } // stable UUID → per-conversation .jsonl transcript
  );
  const reply = await collectStream(stream);

  const now = new Date();
  await db.agent.update({ where: { id: worker.id }, data: { lastMessageAt: now } });
  await db.poolRoute.update({
    where: { poolId_groupId: { poolId: pool.id, groupId: msg.groupId } },
    data: { lastMessageAt: now },
  });
  if (reply) {
    await db.poolMessage.create({
      data: { poolId: pool.id, groupId: msg.groupId, role: "agent", text: reply },
    });
  }
  return reply;
}

// Idle reaper — two stages per worker VM:
//   1. idle ≥ idleSuspendMin → back up each conversation's memory to storage,
//      then SUSPEND (warm window; fast resume, disk preserved).
//   2. idle ≥ destroyIdleMin → DESTROY the VM to reclaim host disk. Its routes
//      are kept but detached (agentId=null) — the externalized memory blob lets
//      the next message restore the conversation onto a fresh VM.
// Order matters: destroy first (clears long-idle VMs), then suspend the 5–10min
// band that remains. Call from a cron/interval. Returns {suspended, destroyed}.
export async function reapIdlePools(): Promise<{ suspended: number; destroyed: number }> {
  let suspended = 0;
  let destroyed = 0;
  const now = Date.now();
  const pools = await db.pool.findMany();
  for (const pool of pools) {
    const suspendCutoff = new Date(now - pool.idleSuspendMin * 60_000);
    const destroyCutoff = new Date(now - pool.destroyIdleMin * 60_000);
    const ctx = await ctxForOwner(pool.ownerId).catch(() => null);
    if (!ctx) continue;

    // Stage 2 — destroy long-idle VMs (running or already-suspended).
    const toDestroy = await db.agent.findMany({
      where: { poolId: pool.id, status: { in: ["running", "suspended"] }, lastMessageAt: { lt: destroyCutoff } },
    });
    for (const w of toDestroy) {
      try {
        // A still-running VM may hold un-backed-up turns since its last suspend —
        // back up before destroying. Suspended VMs were backed up at suspend.
        if (w.status === "running") {
          const routes = await db.poolRoute.findMany({ where: { agentId: w.id } });
          for (const r of routes) {
            await backupConversation(ctx, w, pool.id, r.sessionUuid).catch((e) =>
              console.error(`pool reaper: backup ${r.sessionUuid} failed:`, e)
            );
          }
        }
        await db.poolRoute.updateMany({ where: { agentId: w.id }, data: { agentId: null, detachedAt: new Date() } });
        await destroySandbox(ctx, w.sandboxId);
        await db.agent.delete({ where: { id: w.id } }).catch(() => {});
        destroyed++;
      } catch (e) {
        console.error(`pool reaper: destroy ${w.sandboxId} failed:`, e);
      }
    }

    // Stage 1 — suspend the 5–10min idle band (running VMs not just destroyed).
    const toSuspend = await db.agent.findMany({
      where: { poolId: pool.id, status: "running", lastMessageAt: { lt: suspendCutoff } },
    });
    for (const w of toSuspend) {
      try {
        const routes = await db.poolRoute.findMany({ where: { agentId: w.id } });
        for (const r of routes) {
          await backupConversation(ctx, w, pool.id, r.sessionUuid).catch((e) =>
            console.error(`pool reaper: backup ${r.sessionUuid} failed:`, e)
          );
        }
        await suspendSandbox(ctx, w.sandboxId);
        await db.agent.update({ where: { id: w.id }, data: { status: "suspended" } });
        suspended++;
      } catch (e) {
        console.error(`pool reaper: suspend ${w.sandboxId} failed:`, e);
      }
    }
  }
  return { suspended, destroyed };
}

// Delete a pool: destroy its worker VMs (best-effort), then remove its routes,
// messages and the pool row. Caller must disconnect the Baileys socket first
// (disconnectPool) — kept out of here to avoid a circular import.
export async function deletePool(ctx: AuthContext, poolId: string): Promise<void> {
  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.ownerId !== ctx.user.id) throw new Error("pool not found");
  const workers = await db.agent.findMany({ where: { poolId } });
  for (const w of workers) {
    try {
      await destroySandbox(ctx, w.sandboxId);
      await db.agent.delete({ where: { id: w.id } }).catch(() => {});
    } catch (e) {
      // Don't drop the Agent row if the host VM survived — leave it for
      // reconciliation instead of orphaning a live VM on the box.
      console.error(`deletePool: destroy ${w.sandboxId} failed, keeping row:`, e);
      await db.agent.update({ where: { id: w.id }, data: { status: "error" } }).catch(() => {});
    }
  }
  // Best-effort: drop the externalized memory blobs so they don't orphan.
  const routes = await db.poolRoute.findMany({ where: { poolId }, select: { sessionUuid: true } });
  for (const r of routes) {
    await memClient().deleteObject(memKey(poolId, r.sessionUuid)).catch(() => {});
  }
  await db.poolMessage.deleteMany({ where: { poolId } });
  await db.pool.delete({ where: { id: poolId } }); // PoolRoute cascades
}

// Default identity for pool workers: Ghosty, español, con tools de EasyBits vía
// MCP (la llave EASYBITS_API_KEY la inyecta createAgent → el runtime arma el
// server `easybits`). Va como SYSTEM_PROMPT en persona.env (el claude-worker lo
// lee). Equivale al rol de un CLAUDE.md. Solidificar el default en el template
// (CLAUDE.md propio) es follow-up; por ahora el pool lo inyecta.
const GHOSTY_SYSTEM = [
  "Eres Ghosty, el asistente de EasyBits que atiende por WhatsApp.",
  "Responde SIEMPRE en español, claro y breve, con tono cálido y directo.",
  "Tienes acceso a las herramientas de EasyBits vía MCP (server `easybits`): puedes crear y editar documentos, generar imágenes, subir/leer archivos, crear sitios y más. Úsalas cuando ayuden; no inventes que no puedes.",
  "Si te piden algo fuera de tu alcance, dilo con honestidad y ofrece la mejor alternativa.",
].join(" ");
const GHOSTY_PERSONA = { name: "Ghosty", env: { ASSISTANT_NAME: "Ghosty", SYSTEM_PROMPT: GHOSTY_SYSTEM } };

// Create a pool for an owner. token is the bearer the Baileys surface presents.
export async function createPool(
  ctx: AuthContext,
  opts: {
    name?: string;
    workerTemplate?: string;
    persona?: Persona;
    oauthSecretName?: string;
    maxWorkersPerVm?: number;
    vmMemMb?: number;
    maxVms?: number;
    idleSuspendMin?: number;
    destroyIdleMin?: number;
  } = {}
) {
  return db.pool.create({
    data: {
      ownerId: ctx.user.id,
      name: opts.name,
      token: "pool_" + randomBytes(24).toString("hex"),
      workerTemplate: opts.workerTemplate ?? "claude-worker",
      persona: opts.persona ?? GHOSTY_PERSONA,
      assistantName: "Ghosty",
      oauthSecretName: opts.oauthSecretName ?? null,
      // OJO: maxWorkersPerVm cuenta RUTAS pegajosas (conversaciones), pero la RAM
      // la consume el TURNO ACTIVO (subproceso claude). Entre turnos el subproceso
      // sale → una ruta dormida cuesta ~0 RAM (solo disco). Medición real 2026-06-24
      // (scripts/pool-vm-rss-probe.ts): baseline VM 182MB + ~221MB por turno LIGERO
      // (sin tools); presupuesta ~450MB/turno con MCP/tool calls. 4 turnos ligeros
      // concurrentes = 1059MB (53% de 2GB); 4 pesados ≈ 1982MB ≈ 99% (al borde →
      // semáforo encola el 5º). Densidad ~512MB/agente, en pares: 1GB→2, 2GB→4,
      // 4GB→8. 512MB NO alcanza ni para 1 turno con tools.
      maxWorkersPerVm: opts.maxWorkersPerVm ?? 4,
      vmMemMb: opts.vmMemMb ?? 2048,
      maxVms: opts.maxVms ?? 10,
      // Destroy agresivo: el disco es el cuello de botella del box, y la memoria
      // de cada conversación se externaliza a S3 (backup en suspend, restore en
      // cold-spawn) — round-trip probado byte-a-byte (scripts/pool-memory-roundtrip.ts).
      // suspend@2min (resume rápido, RAM liberada) → destroy@3min (recupera disco).
      idleSuspendMin: opts.idleSuspendMin ?? 2,
      destroyIdleMin: opts.destroyIdleMin ?? 3,
    },
  });
}
