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
} from "~/.server/core/sandboxOperations";
import { getSecretValue } from "~/.server/core/secretOperations";

export class PoolAtCapacity extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PoolAtCapacity";
  }
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
  const live = await db.agent.count({
    where: { poolId: pool.id, status: { in: ["running", "suspended", "building"] } },
  });
  if (live >= pool.maxVms) {
    throw new PoolAtCapacity(`pool ${pool.id} at maxVms (${pool.maxVms})`);
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
  });
  await db.agent.update({
    where: { id: created.agentId },
    data: { poolId: pool.id, lastMessageAt: new Date(), host: target.url },
  });
  return waitAgentRunning(created.agentId); // returns the running row
}

// Resolve the VM that should host the worker for `groupId`: sticky route if any
// (resuming a suspended VM), else a VM with a free worker slot, else spawn a VM.
async function pickOrSpawn(ctx: AuthContext, pool: Awaited<ReturnType<typeof db.pool.findUniqueOrThrow>>, groupId: string) {
  const ensureRunning = async (agent: NonNullable<Awaited<ReturnType<typeof db.agent.findUnique>>>) => {
    if (agent.status === "running") return agent;
    if (agent.status === "suspended") {
      await resumeSandbox(ctx, agent.sandboxId);
      await db.agent.update({ where: { id: agent.id }, data: { status: "running" } });
      return waitAgentRunning(agent.id);
    }
    if (agent.status === "building") return waitAgentRunning(agent.id);
    return null; // error/destroyed → caller drops it
  };

  type AgentRow = NonNullable<Awaited<ReturnType<typeof db.agent.findUnique>>>;
  const assign = async (vm: AgentRow) => {
    const sessionUuid = randomUUID();
    await db.poolRoute.create({ data: { poolId: pool.id, groupId, agentId: vm.id, sessionUuid } });
    return { vm, sessionUuid };
  };

  // 1. Sticky route — reuse its worker + sessionUuid (resume handle).
  const route = await db.poolRoute.findUnique({
    where: { poolId_groupId: { poolId: pool.id, groupId } },
  });
  if (route) {
    const agent = await db.agent.findUnique({ where: { id: route.agentId } });
    const ready = agent ? await ensureRunning(agent) : null;
    if (ready) return { vm: ready, sessionUuid: route.sessionUuid };
    await db.poolRoute.delete({ where: { id: route.id } }); // stale worker, re-route
  }

  // 2. A VM of this pool with a free worker slot.
  const vms = await db.agent.findMany({
    where: { poolId: pool.id, status: { in: ["running", "suspended"] } },
  });
  for (const vm of vms) {
    if ((await workersOnVm(vm.id)) >= pool.maxWorkersPerVm) continue;
    const ready = await ensureRunning(vm);
    if (ready) return assign(ready);
  }

  // 3. Scale out: spawn another VM (RAM-gated). Throws PoolAtCapacity if no room.
  const vm = await spawnVm(ctx, pool);
  return assign(vm);
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

// Idle reaper — suspend workers with no activity for idleSuspendMin (warm window).
// Disk (incl. .jsonl transcripts) is preserved by suspend; next message resumes.
// Call from a cron/interval. Returns how many were suspended.
export async function reapIdlePools(): Promise<number> {
  let suspended = 0;
  const pools = await db.pool.findMany();
  for (const pool of pools) {
    const cutoff = new Date(Date.now() - pool.idleSuspendMin * 60_000);
    const idle = await db.agent.findMany({
      where: { poolId: pool.id, status: "running", lastMessageAt: { lt: cutoff } },
    });
    if (!idle.length) continue;
    const ctx = await ctxForOwner(pool.ownerId).catch(() => null);
    if (!ctx) continue;
    for (const w of idle) {
      try {
        await suspendSandbox(ctx, w.sandboxId);
        await db.agent.update({ where: { id: w.id }, data: { status: "suspended" } });
        suspended++;
      } catch (e) {
        console.error(`pool reaper: suspend ${w.sandboxId} failed:`, e);
      }
    }
  }
  return suspended;
}

// Delete a pool: destroy its worker VMs (best-effort), then remove its routes,
// messages and the pool row. Caller must disconnect the Baileys socket first
// (disconnectPool) — kept out of here to avoid a circular import.
export async function deletePool(ctx: AuthContext, poolId: string): Promise<void> {
  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.ownerId !== ctx.user.id) throw new Error("pool not found");
  const workers = await db.agent.findMany({ where: { poolId } });
  for (const w of workers) {
    await destroySandbox(ctx, w.sandboxId).catch(() => {});
    await db.agent.delete({ where: { id: w.id } }).catch(() => {});
  }
  await db.poolMessage.deleteMany({ where: { poolId } });
  await db.pool.delete({ where: { id: poolId } }); // PoolRoute cascades
}

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
  } = {}
) {
  return db.pool.create({
    data: {
      ownerId: ctx.user.id,
      name: opts.name,
      token: "pool_" + randomBytes(24).toString("hex"),
      workerTemplate: opts.workerTemplate ?? "claude-worker",
      persona: opts.persona ?? undefined,
      oauthSecretName: opts.oauthSecretName ?? null,
      maxWorkersPerVm: opts.maxWorkersPerVm ?? 8,
      vmMemMb: opts.vmMemMb ?? 2048,
      maxVms: opts.maxVms ?? 6,
      idleSuspendMin: opts.idleSuspendMin ?? 5,
    },
  });
}
