// FleetAgent manager — the always-on WhatsApp SURFACE that routes inbound group
// messages to a fleet of ephemeral worker Agents (claude-worker / ghosty-gc).
//
// Design (see plan lucky-finding-lecun):
//   - Workers are spawned on demand, multiplex conversations by sessionId=groupId,
//     scale out when full (RAM-gated via /v1/stats), and suspend when idle.
//   - Routing is STICKY per group so the worker's native resume state (the Agent
//     SDK .jsonl transcript on its disk, preserved across suspend/resume) stays
//     coherent. FleetAgentRoute is the sticky map; FleetAgentMessage is the durable log.
//   - Branding/OAuth: fleetAgent.persona.env is injected into every worker spawn, so
//     the owner's Max-account OAuth + persona power the whole fleetAgent.
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

export class FleetAgentAtCapacity extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FleetAgentAtCapacity";
  }
}

// A chatty group exceeded its per-(fleetAgent,group) rate limit. The Baileys surface
// catches this and sends one brief "saturado" notice instead of spawning work.
export class FleetAgentRateLimited extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FleetAgentRateLimited";
  }
}

// Admission backoff policy — when a surface hits FleetAgentAtCapacity it HOLDS the
// message and retries instead of dropping it (the user never resends). Shared
// here (not in the Baileys surface) so a future WABA surface reuses the same
// schedule. Dos formas de liberarse dentro de la ventana: (a) un turno activo
// termina y libera RAM (cadencia ~60s); (b) en saturación de slots, el reaper
// DUERME una VM ociosa (idleSuspendMin=2min + cadencia 60s ⇒ hasta ~3min) y el
// reintento la DESALOJA (LRU) para meter al que espera. Por eso el give-up vive
// por ENCIMA de idleSuspendMin + cadencia: si no, la cola se rendiría justo antes
// de que aparezca la víctima dormida y nunca llegaría a desalojar.
export const ADMIT_BACKOFFS_MS = [5_000, 10_000, 20_000, 30_000]; // last value caps
export const ADMIT_GIVEUP_MS = 240_000; // hold ~4 min (> idleSuspendMin+cadencia), luego una disculpa
export const admitRetryDelay = (attempt: number) =>
  ADMIT_BACKOFFS_MS[Math.min(attempt, ADMIT_BACKOFFS_MS.length - 1)];

// ── In-flight turn guard ──────────────────────────────────────────────────────
// VMs currently servicing a turn (working, or waiting on tools/subagents that
// emit no chunks). The reaper measures idle by lastMessageAt, which is only
// bumped AFTER a turn completes — so a turn longer than idleSuspendMin/destroyIdleMin
// (2/3 min by default) would otherwise be suspended/destroyed mid-flight, cutting
// the SSE stream and leaving the user with silence. In-memory is correct here:
// the Baileys surface + reaper run in the SAME single-instance process (same
// constraint as placeLocks). Keyed by Agent.id.
// SCALING CAVEAT: this guard (and executeWaAction's socket lookup) assume ONE Fly
// machine. Before scaling to >1 machine: the reaper needs a DB-backed busy marker
// (e.g. Agent.turnStartedAt) / leader election, and the Baileys socket stays
// single-instance — else machine B's reaper could reap a VM busy on machine A.
const busyVms = new Set<string>();

// ── Audit instrumentation (FLEET_AUDIT_LOG=1) ──────────────────────────────────
// Stage-by-stage timing/decisions for the live Baileys audit (warm/cold place,
// boot ms, turn ms, self-heal, reaper). Off unless the flag is set so prod logs
// stay clean. Grep `fly logs` for `[fleet-audit]`.
const AUDIT = process.env.FLEET_AUDIT_LOG === "1";
function auditLog(event: string, data?: Record<string, unknown>) {
  if (AUDIT) console.log(`[fleet-audit] ${event}`, data ? JSON.stringify(data) : "");
}

// Classify a turn failure. A DEAD BOX (host unreachable / VM gone via crash /
// restart / TTL — NOT a manual delete) is self-healable: mark the worker "lost"
// and re-place once on a fresh VM. A legitimate AI error (the worker answered
// with an SSE error event) is NOT — rethrow so we don't respawn-loop or mask a
// real fault. Conservative: only KNOWN connection signatures count as dead-box;
// anything else rethrows (never respawn on doubt).
function isBoxDeadError(e: unknown): boolean {
  const cause = (e as { cause?: { message?: string } })?.cause?.message ?? "";
  const msg = `${e instanceof Error ? e.message : String(e)} ${cause}`;
  if (/agent stream/i.test(msg)) return false; // SSE {type:"error"} = real AI error
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|fetch failed|socket hang up|network|terminated|aborted|502|503|504|\b404\b|not running|vanished|failed to start/i.test(
    msg
  );
}

// Mark a worker's Agent row "lost" so the cold path (reserveVm filters to
// running/building/suspended) excludes it and re-spawns a clean VM. Same
// terminal state destroySandbox sets on manual delete (commit 5889cc43).
async function markWorkerLost(agentId: string): Promise<void> {
  await db.agent.updateMany({ where: { id: agentId }, data: { status: "lost" } }).catch(() => {});
}

// ── In-process placement mutex ────────────────────────────────────────────────
// The Baileys surface is single-instance (accepted constraint), so an in-memory
// lock is a correct serialization point. Used to serialize the capacity decision
// (pick free VM / spawn / assign route) per fleetAgent so concurrent inbound messages
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
const MEM_PREFIX = "fleet-memory/";
const memKey = (fleetAgentId: string, sessionUuid: string) => `${fleetAgentId}/${sessionUuid}.tgz`;
const memClient = () => getPlatformDefaultClient({ prefix: MEM_PREFIX });

// Tar the conversation's workspace on the VM → upload to storage. Best-effort;
// the caller logs failures (a lost backup just means that conversation starts
// fresh after a destroy — degraded, not broken). Requires the VM running.
export async function backupConversation(
  ctx: AuthContext,
  vm: { sandboxId: string },
  fleetAgentId: string,
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
  await memClient().putObject(memKey(fleetAgentId, sessionUuid), Buffer.from(content, "base64"), "application/gzip");
  await execCommand(ctx, vm.sandboxId, { command: `rm -f ${tgz}`, timeoutSeconds: 15 }).catch(() => {});
}

// Download the conversation's memory blob (if any) and untar it into the VM's
// /data. No-op (returns false) when no blob exists — a brand-new conversation.
export async function restoreConversation(
  ctx: AuthContext,
  vm: { sandboxId: string },
  fleetAgentId: string,
  sessionUuid: string
): Promise<boolean> {
  const url = await memClient().getReadUrl(memKey(fleetAgentId, sessionUuid)).catch(() => null);
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
// The fleetAgent ingress is box-agnostic; placement is the only box-aware decision.
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
  // Config UNIT for this turn (capabilities + per-group key), separate from the
  // sticky routing `groupId`. WABA routes per-conversation (waba:<int>:<sender>,
  // for 1:1 memory) but configures per-NUMBER (waba:<int>): pass that here.
  // Absent (Baileys/web) → falls back to groupId, so behavior is unchanged.
  configGroupId?: string;
  sender?: string;
  text: string;
  mediaUrl?: string;
  // Inbound image bytes (base64) for NATIVE Claude vision: written onto the
  // worker's disk so the agent's Read tool sees it (no Gemini middle step).
  image?: { base64: string; ext: string; url?: string };
  // Inbound voice note (base64) for channel-agnostic STT. When present and `text`
  // is empty, routeMessage transcribes it (box-first whisper, Gemini fallback) so
  // ANY channel (web/WABA/Slack) gets voice input — not just Baileys (which
  // pre-transcribes in its media extractor and omits this).
  audio?: { base64: string; mimeType: string };
  // Per-message MCP key override (the org's dnk_pub_/admin key). Web channels
  // (denik widget/admin) pass it per turn instead of pre-registering one per
  // ephemeral conversation; wins over fleetAgent.groupKeys[groupId]. WhatsApp omits it
  // and relies on the pre-registered groupKeys.
  denikApiKey?: string;
  // Per-message personalización por-org (capa 3): se APPENDEA a la persona del
  // fleetAgent en el worker (que a su vez se appendea al preset). Canales web (denik)
  // la pasan por turno; WhatsApp la omite.
  appendSystemPrompt?: string;
  // Turno de ADMINISTRACIÓN: el dueño escribe desde la conversación admin (WABA
  // self-chat o sender designado). Inyecta el MCP `admin` + una nota de sistema
  // para que el agente gestione números/identidad/capacidades. Solo lo setea el
  // surface tras verificar is_from_me + número normalizado — nunca el agente.
  admin?: boolean;
};

// ── MCP catalog (config-driven capabilities, nanoclaw parity) ────────────────
// A fleetAgent (agent) offers a MENU of MCP servers; each group enables a SUBSET. The
// catalog lives on FleetAgent.mcpCatalog; the per-group selection on FleetAgent.groupConfigs.
export type McpCatalogEntry = {
  name: string; // unique key + Claude tool prefix (mcp__<name>__*)
  label?: string; // human label for the UI
  description?: string; // one-line explainer for the UI
  transport: "stdio" | "http";
  command?: string; // stdio: e.g. "npx"
  args?: string[]; // stdio: e.g. ["-y", "@brightdata/mcp"]
  url?: string; // http: remote MCP endpoint
  // env values may reference a vault secret as "$secret:NAME" — resolved per-turn
  // from the owner's vault (never stored raw). Non-secret values pass through.
  env?: Record<string, string>;
  requiredSecrets?: string[]; // vault secret names this capability needs to work
  builtin?: boolean; // easybits/wa — always-on, not togglable
};
export type GroupConfig = { mcpServers?: string[]; env?: Record<string, string>; disabledBuiltins?: string[] };

// Builtins (easybits/wa) the group turned OFF. Absent/[] = all builtins ON
// (backward-compatible default). The worker removes these from its merged MCP set
// for that group's turn — e.g. ["easybits"] forces the agent onto fleet service
// boxes instead of the EasyBits MCP. Keyed by the same groupId/cfgId as mcpServers.
export function resolveDisabledBuiltins(
  fleetAgent: { groupConfigs?: unknown },
  groupId: string
): string[] {
  const cfg = ((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {})[groupId] ?? {};
  return cfg.disabledBuiltins ?? [];
}

// $secret:NAME reference shape (same as agentOperations.expandMcpServerSecrets).
const SECRET_REF_RE = /^\$secret:([A-Z_][A-Z0-9_]*)$/;

// Builtins seeded on every fleetAgent: easybits + wa are ALWAYS active in the worker
// (baked env / in-process), not togglable. NO denik here — denik's per-group org
// key is a reseller-only path (groupKeys + denikApiKey), invisible to the generic UI.
export const DEFAULT_MCP_CATALOG: McpCatalogEntry[] = [
  { name: "easybits", label: "EasyBits — archivos, docs, imágenes", transport: "stdio", command: "npx", args: ["-y", "@easybits.cloud/mcp"], builtin: true },
  { name: "wa", label: "Personal y grupos (QR) — enviar archivos, encuestas, reacciones", transport: "stdio", builtin: true },
];

// CURATED capabilities EasyBits ships in CODE (not stored in the DB) — every agent
// can enable these per group. Each declares the vault secret(s) it needs; the
// owner provides them once (agent-level) and the per-group toggle just turns the
// capability on/off. Custom (advanced) MCPs live in FleetAgent.mcpCatalog instead.
export const CURATED_CAPABILITIES: McpCatalogEntry[] = [
  {
    name: "brightdata",
    label: "Scraping web (Brightdata)",
    description: "Lee páginas reales y sitios que bloquean bots (distinto a la búsqueda web nativa del agente).",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@brightdata/mcp"],
    env: { API_TOKEN: "$secret:BRIGHTDATA_API_TOKEN" },
    requiredSecrets: ["BRIGHTDATA_API_TOKEN"],
  },
  {
    // Denik agenda (contactos + reservas). Mismo binario `denik-mcp` pre-instalado
    // en la imagen del worker que usa el path per-turn (groupKeys/denikApiKey); aquí
    // lo exponemos como capacidad curada para que sea configurable por-grupo desde
    // la UI (antes solo se podía registrar invisible vía groupKeys). DENIK_BASE_URL
    // tiene default https://www.denik.me dentro de @denik.me/mcp, no hace falta pasarlo.
    name: "denik",
    label: "Denik — agenda y contactos",
    description: "Buscar contactos y gestionar reservas de tu agenda Denik.",
    transport: "stdio",
    command: "denik-mcp",
    args: [],
    env: { DENIK_API_KEY: "$secret:DENIK_API_KEY" },
    requiredSecrets: ["DENIK_API_KEY"],
  },
];

// The full capability menu for a fleetAgent: curated (code) ∪ the owner's custom entries
// (FleetAgent.mcpCatalog, non-builtin, not shadowing a curated name). Single source of
// truth for the dashboard, the agent (wa-action) and per-turn resolution.
export function mergedCapabilities(fleetAgent: { mcpCatalog?: unknown }): McpCatalogEntry[] {
  const stored = (fleetAgent.mcpCatalog as McpCatalogEntry[] | null) ?? [];
  const custom = stored.filter(
    (e) => !e.builtin && !CURATED_CAPABILITIES.some((c) => c.name === e.name)
  );
  return [...CURATED_CAPABILITIES, ...custom];
}

// Resolve the per-turn EXTRA MCP servers a group enabled, as a name→serverDef map
// the worker merges over its baked builtins. CRUX: the per-turn path is a verbatim
// passthrough (nothing downstream expands $secret), so we resolve $secret:NAME here
// from the OWNER's vault and emit PLAINTEXT env. A capability whose required secret
// is missing is SKIPPED entirely — never ship a half-configured MCP to the worker.
export async function resolveGroupMcpServers(
  fleetAgent: { mcpCatalog?: unknown; groupConfigs?: unknown },
  groupId: string,
  ownerId: string
): Promise<Record<string, unknown> | undefined> {
  const cfg = ((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {})[groupId] ?? {};
  const enabled = cfg.mcpServers;
  if (!enabled?.length) return undefined;
  const caps = mergedCapabilities(fleetAgent);
  const out: Record<string, unknown> = {};
  for (const e of caps) {
    if (e.builtin || !enabled.includes(e.name)) continue;
    const rawEnv = { ...(e.env ?? {}), ...(cfg.env ?? {}) };
    const env: Record<string, string> = {};
    let missing = false;
    for (const [k, v] of Object.entries(rawEnv)) {
      const m = SECRET_REF_RE.exec(v);
      if (!m) { env[k] = v; continue; }
      const val = await getSecretValue(ownerId, m[1]).catch(() => null);
      if (val == null) { missing = true; break; }
      env[k] = val;
    }
    if (missing) continue;
    out[e.name] =
      e.transport === "http"
        ? { type: "http", url: e.url, ...(Object.keys(env).length ? { env } : {}) }
        : { type: "stdio", command: e.command, args: e.args ?? [], env };
  }
  return Object.keys(out).length ? out : undefined;
}

// The always-on `render` MCP server (PDF/screenshots via the on-demand Gotenberg
// box). Injected into EVERY turn for EVERY fleet agent, NOT subject to
// disabledBuiltins/catalog — so the agent can render even with the EasyBits MCP
// off in the group. Auth = the fleetAgent token (header + ?token= belt-and-braces).
function renderMcpServer(fleetAgent: { id: string; token: string }): Record<string, unknown> {
  const base = (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
  const url = `${base}/api/v2/fleet-render/${fleetAgent.id}/mcp?token=${encodeURIComponent(fleetAgent.token)}`;
  return {
    render: { type: "http", url, headers: { Authorization: `Bearer ${fleetAgent.token}` } },
  };
}

// Admin MCP server — gestiona números/identidad/capacidades del propio FleetAgent.
// Mismo patrón que renderMcpServer (HTTP, auth = fleetAgent token), pero inyectado
// SOLO en turnos admin (msg.admin) → el dueño administra el agente desde su
// conversación admin de WABA. Auth del endpoint = token; las tools solo se ofrecen
// cuando el surface marcó el turno como admin (is_from_me + número verificado).
function adminMcpServer(fleetAgent: { id: string; token: string }): Record<string, unknown> {
  const base = (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
  const url = `${base}/api/v2/fleet-admin/${fleetAgent.id}/mcp?token=${encodeURIComponent(fleetAgent.token)}`;
  return {
    admin: { type: "http", url, headers: { Authorization: `Bearer ${fleetAgent.token}` } },
  };
}

// Nota de sistema fresca para turnos admin (vía appendSystemPrompt, como el
// guardrail de voz). Le dice al agente que está en su conversación de administración
// y que use las tools mcp__admin__* para gestionar la flota.
const ADMIN_NOTE =
  "MODO ADMINISTRACIÓN: estás en la conversación de administración de este agente (el dueño te escribe en privado). " +
  "Tienes herramientas `mcp__admin__*` para LISTAR y CONFIGURAR los números WhatsApp Business (WABA) del agente: " +
  "ver números, editar su identidad (nombre/instrucciones) y ajustar sus capacidades. Úsalas cuando te pidan administrar.";

// Build a background AuthContext for a fleetAgent's owner. FleetAgent dispatch runs outside
// any HTTP request (reaper, autoscale), so we mint a ctx with full owner scopes.
async function ctxForOwner(ownerId: string): Promise<AuthContext> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  if (!user) throw new Error(`fleetAgent owner ${ownerId} not found`);
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
// also lets us log the full reply as FleetAgentMessage.
async function collectStream(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (s: string) => void
): Promise<string> {
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
        if (evt.type === "chunk" && typeof evt.value === "string") {
          reply += evt.value;
          onChunk?.(evt.value);
        } else if (evt.type === "error") throw new Error(evt.message || "agent stream error");
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
  return db.fleetAgentRoute.count({ where: { agentId } });
}

// Spawn a fresh VM for the fleetAgent, branded from persona, RAM-gated.
const appBaseUrl = () =>
  (process.env.BASE_URL || process.env.EASYBITS_URL || process.env.SITE_URL || "https://www.easybits.cloud").replace(/\/$/, "");

async function spawnVm(ctx: AuthContext, fleetAgent: { id: string; name: string | null; workerTemplate: string; persona: unknown; vmMemMb: number; maxVms: number; oauthSecretName: string | null; token: string }) {
  // ── Account sandbox budget (la fuente de verdad, consistente con el HUD) ──
  // El plan da `concurrentSandboxes` y las reservas (add-ons) suman. TODAS las
  // sandboxes del owner en el host consumen este budget — workers de CUALQUIER
  // canal, llamadas livekit, custom, permanentes — no solo los de este fleetAgent. Por
  // eso contamos vía listSandboxes (todo el host del owner), no db.agent. El fleetAgent
  // NO puede pasarse de aquí: el "X/N sandboxes" del HUD es real, no solo display.
  // (pickHost sigue como gate FÍSICO de RAM; este es el gate LÓGICO de plan.)
  const plan = getUserPlan(ctx.user);
  const reserved = await getReservedCapacity(ctx.user.id).catch(() => ({ machines: 0, agents: 0 }));
  const budget = (PLANS[plan]?.concurrentSandboxes ?? 2) + reserved.machines;
  const hostVms = await listSandboxes(ctx).catch(() => null);
  // El host OMITE las VMs suspendidas de su listing (las snapshotea y las saca).
  // Un budget contado solo sobre running/starting REGALA capacidad: el tenant
  // llena sus cajas, deja que el reaper las duerma (desaparecen del conteo) y
  // vuelve a spawnear encima → duplica su cupo y es explotable. Una VM suspendida
  // es capacidad reservada real (disco + snapshot resume <1s), así que la sumamos
  // de vuelta desde DB (el owner es dueño de sus workers de fleetAgent).
  const suspended = await db.agent.count({ where: { ownerId: ctx.user.id, status: "suspended" } });
  const live = hostVms
    ? hostVms.filter((v) => v.status === "running" || v.status === "starting").length
    : await db.agent.count({ where: { fleetAgentId: fleetAgent.id, status: { in: ["running", "building"] } } });
  const inUse = live + suspended;
  if (inUse >= Math.min(budget, fleetAgent.maxVms)) {
    throw new FleetAgentAtCapacity(`account at sandbox budget (${inUse}/${budget})`);
  }
  // RAM gate, multi-box aware: pick the box with the most free RAM that fits the
  // VM. null = no box has room → queue. (The host also rejects at create as a
  // backstop.) Single-box today: pickHost returns the only box.
  const target = await pickHost(fleetAgent.vmMemMb);
  if (!target) {
    throw new FleetAgentAtCapacity(`no box has ${fleetAgent.vmMemMb}MB free`);
  }
  const persona = (fleetAgent.persona ?? {}) as Persona;
  const env = { ...(persona.env ?? {}) };
  // Resolve the channel's Claude OAuth from the chosen vault secret (default
  // CLAUDE_CODE_OAUTH_TOKEN) and inject it for claude-worker. Lets different
  // channels use different Max accounts. persona.env wins if it already set it.
  if (!env.CLAUDE_CODE_OAUTH_TOKEN) {
    const secretName = fleetAgent.oauthSecretName || "CLAUDE_CODE_OAUTH_TOKEN";
    const oauth = await getSecretValue(ctx.user.id, secretName).catch(() => null);
    if (oauth) env.CLAUDE_CODE_OAUTH_TOKEN = oauth;
  }
  // WhatsApp action callback — lets the worker's in-process `wa` MCP send polls/
  // reactions/locations/files into the chat via the shared Baileys socket. The
  // worker authenticates with the fleet-agent token; the endpoint resolves sessionId →
  // group and gates elevated actions by mainGroupJid.
  env.FLEET_TOKEN = fleetAgent.token;
  env.FLEET_WA_ACTION_URL = `${appBaseUrl()}/api/v2/fleet-agents/wa-action`;
  // TODO(multi-box): target.url must drive createSandbox/callHost; today it uses
  // the single SANDBOX_HOST_URL, so target is recorded but not yet routed.
  const created = await createAgent(ctx, {
    template: fleetAgent.workerTemplate as SandboxTemplate,
    env,
    name: persona.name ?? `${fleetAgent.name ?? "fleetAgent"}-worker`,
    seedFiles: persona.seedFiles,
    memoryMb: fleetAgent.vmMemMb, // size the VM per the channel's config (e.g. 512MB)
    vcpus: fleetAgent.vmMemMb <= 512 ? 1 : 2,
  });
  auditLog("spawn", { fleetAgent: fleetAgent.id, agentId: created.agentId, memMb: fleetAgent.vmMemMb, box: target.url });
  // Return the BUILDING row immediately — the caller waits for it to come up
  // OUTSIDE the placement lock (so concurrent cold conversations boot in
  // parallel, not serialized behind each other's ~boot time).
  return db.agent.update({
    where: { id: created.agentId },
    data: { fleetAgentId: fleetAgent.id, lastMessageAt: new Date(), host: target.url },
  });
}

type PoolRow = Awaited<ReturnType<typeof db.fleetAgent.findUniqueOrThrow>>;
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
// host create-call). Runs under the per-fleetAgent placement lock so concurrent cold
// conversations can't both grab the last slot or exceed maxVms. The slow boot
// (waitAgentRunning) and memory restore happen OUTSIDE the lock in pickOrSpawn,
// so N cold conversations boot in parallel instead of serializing.
//   - Counts "building" VMs as candidates so two concurrent placements SHARE a
//     booting VM (up to maxWorkersPerVm) rather than each spawning its own.
type Reservation = { agentId: string; sessionUuid: string; needsRestore: boolean };
async function reserveVm(ctx: AuthContext, fleetAgent: PoolRow, groupId: string): Promise<Reservation> {
  const key = { fleetAgentId_groupId: { fleetAgentId: fleetAgent.id, groupId } };
  return withLock(`place:${fleetAgent.id}`, async () => {
    const fresh = await db.fleetAgentRoute.findUnique({ where: key });

    // Find a VM with a free slot — include "building" so concurrent placements
    // pack onto a booting VM instead of over-spawning. Prefer the route's
    // current VM if it still has a slot (no churn).
    const vms = await db.agent.findMany({
      where: { fleetAgentId: fleetAgent.id, status: { in: ["running", "building", "suspended"] } },
    });
    let target: AgentRow | null = null;
    if (fresh?.agentId) target = vms.find((v) => v.id === fresh.agentId) ?? null;
    if (!target) {
      for (const vm of vms) {
        if ((await workersOnVm(vm.id)) >= fleetAgent.maxWorkersPerVm) continue;
        target = vm;
        break;
      }
    }
    if (!target) {
      try {
        target = await spawnVm(ctx, fleetAgent); // building row; throws FleetAgentAtCapacity if no room
      } catch (e) {
        if (!(e instanceof FleetAgentAtCapacity)) throw e;
        // En el techo de flota: en vez de pasarnos (la "generosidad" explotable),
        // RECICLAMOS un slot. Desalojamos la conversación dormida menos-reciente
        // (LRU) de una VM SUSPENDIDA — su memoria ya está en S3 (backup al
        // suspender), así que volverá a montarse fría (~12s) la próxima vez que
        // hable. Sólo suspendidas: están ociosas por definición y respaldadas, así
        // no cortamos un turno en vuelo. Si NO hay ninguna dormida, todo está vivo
        // de verdad → back-pressure legítima: relanzamos FleetAgentAtCapacity.
        const napping = await db.agent.findMany({ where: { fleetAgentId: fleetAgent.id, status: "suspended" }, select: { id: true } });
        const victim = napping.length
          ? await db.fleetAgentRoute.findFirst({
              where: { fleetAgentId: fleetAgent.id, groupId: { not: groupId }, agentId: { in: napping.map((v) => v.id) } },
              orderBy: { lastMessageAt: "asc" },
            })
          : null;
        if (!victim?.agentId) throw e;
        await db.fleetAgentRoute.update({ where: { id: victim.id }, data: { agentId: null, detachedAt: new Date() } });
        auditLog("evict", { fleetAgent: fleetAgent.id, victim: victim.groupId, freedVm: victim.agentId });
        // El slot liberado vive en una VM suspendida → ensureRunning la resume.
        target = vms.find((v) => v.id === victim.agentId) ?? (await db.agent.findUniqueOrThrow({ where: { id: victim.agentId } }));
      }
    }

    // Claim/refresh the route to point at the target, reserving the slot.
    if (fresh) {
      const moved = fresh.agentId !== target.id;
      if (moved) {
        await db.fleetAgentRoute.update({ where: { id: fresh.id }, data: { agentId: target.id, detachedAt: null } });
      }
      // Restore when the route was detached (cold) or moved to a different VM.
      return { agentId: target.id, sessionUuid: fresh.sessionUuid, needsRestore: !fresh.agentId || moved };
    }
    const sessionUuid = randomUUID();
    try {
      await db.fleetAgentRoute.create({ data: { fleetAgentId: fleetAgent.id, groupId, agentId: target.id, sessionUuid } });
    } catch {
      const won = await db.fleetAgentRoute.findUnique({ where: key }); // adopt the winner
      if (won) return { agentId: won.agentId ?? target.id, sessionUuid: won.sessionUuid, needsRestore: !won.agentId };
      throw new Error(`fleetAgent route race for ${groupId} left no winner`);
    }
    return { agentId: target.id, sessionUuid, needsRestore: false };
  });
}

// Resolve the VM that should host the worker for `groupId`. Sticky per group:
//   - warm path (route + running agent): return it, no lock, no wait.
//   - cold path: reserve under the lock (fast), then boot + restore OUTSIDE the
//     lock so concurrent cold conversations come up in parallel.
async function pickOrSpawn(ctx: AuthContext, fleetAgent: PoolRow, groupId: string) {
  // 1. Warm path — route with an already-running worker.
  const route = await db.fleetAgentRoute.findUnique({ where: { fleetAgentId_groupId: { fleetAgentId: fleetAgent.id, groupId } } });
  if (route?.agentId) {
    const agent = await db.agent.findUnique({ where: { id: route.agentId } });
    if (agent?.status === "running") {
      auditLog("place.warm", { groupId, agentId: agent.id });
      return { vm: agent, sessionUuid: route.sessionUuid };
    }
  }

  // 2. Cold path — fast reservation under the lock; slow boot/restore outside it.
  const t0 = Date.now();
  const res = await reserveVm(ctx, fleetAgent, groupId);
  const reserved = await db.agent.findUniqueOrThrow({ where: { id: res.agentId } });
  const wasBuilding = reserved.status === "building";
  const vm = await ensureRunning(ctx, reserved); // waits for boot/resume — in PARALLEL across groups
  if (!vm) throw new Error(`fleetAgent worker ${res.agentId} failed to start`);
  if (res.needsRestore) {
    await restoreConversation(ctx, vm, fleetAgent.id, res.sessionUuid).catch((e) =>
      console.error(`fleetAgent restore ${res.sessionUuid} failed:`, e)
    );
  }
  auditLog("place.cold", {
    groupId,
    agentId: res.agentId,
    bootMs: Date.now() - t0,
    building: wasBuilding,
    restored: res.needsRestore,
  });
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

// Session command — `/clear` (and aliases) resets a group's conversation: drops
// the externalized memory blob, wipes the workspace on a live VM, and rotates the
// sessionUuid so the NEXT message starts a brand-new conversation. Mirrors
// nanoclaw's /clear ("Sesión limpia. 🧹"). The durable FleetAgentMessage audit log is
// intentionally kept (it's not fed back to the worker's memory).
async function clearGroupSession(ctx: AuthContext, fleetAgent: PoolRow, groupId: string): Promise<string> {
  const route = await db.fleetAgentRoute.findUnique({ where: { fleetAgentId_groupId: { fleetAgentId: fleetAgent.id, groupId } } });
  if (route) {
    await memClient().deleteObject(memKey(fleetAgent.id, route.sessionUuid)).catch(() => {});
    if (route.agentId) {
      const vm = await db.agent.findUnique({ where: { id: route.agentId } });
      if (vm?.status === "running") {
        await execCommand(ctx, vm.sandboxId, {
          command: `rm -rf /data/workspaces/${route.sessionUuid} /data/.claude/projects/-data-workspaces-${route.sessionUuid}`,
          timeoutSeconds: 30,
        }).catch(() => {});
      }
    }
    await db.fleetAgentRoute.update({ where: { id: route.id }, data: { sessionUuid: randomUUID() } });
  }
  return "Sesión limpia. 🧹";
}

// MAIN ENTRY — the Baileys surface calls this per inbound group message.
// Returns the agent's reply text (to send back to the group).
export async function routeMessage(
  fleetAgentId: string,
  msg: InboundMessage,
  opts: { skipRateLimit?: boolean; hasMedia?: boolean; onChunk?: (s: string) => void } = {}
): Promise<string> {
  const fleetAgent = await db.fleetAgent.findUniqueOrThrow({ where: { id: fleetAgentId } });
  const ctx = await ctxForOwner(fleetAgent.ownerId);

  // Channel-agnostic STT: a non-Baileys channel can hand us a raw voice note;
  // transcribe it here so the rest of the turn is plain text. Baileys omits
  // `audio` (it transcribes in its media extractor) → this is a no-op for it.
  if (!msg.text.trim() && msg.audio?.base64) {
    const { transcribeAudio } = await import("./fleetVoice");
    const t = await transcribeAudio(
      fleetAgent.ownerId,
      Buffer.from(msg.audio.base64, "base64"),
      msg.audio.mimeType
    );
    if (t) msg = { ...msg, text: t };
  }

  auditLog("route.in", {
    groupId: msg.groupId,
    sender: msg.sender ?? null,
    textLen: msg.text.length,
    // Truthful flag from the edge's extraction; falls back to mediaUrl presence.
    hasMedia: opts.hasMedia ?? !!msg.mediaUrl,
  });

  // Per-(fleetAgent, group) rate limit so one chatty group can't drain the fleet. The
  // in-process Baileys edge checks this BEFORE extracting media (to not pay for
  // Gemini on a spammy group) and passes skipRateLimit so we don't double-count;
  // the HTTP surface relies on this check. FleetAgentRateLimited → one "saturado" notice.
  if (!opts.skipRateLimit) {
    const rl = await checkSandboxRateLimit(`${fleetAgentId}:${msg.groupId}`, "op");
    if (!rl.allowed) {
      throw new FleetAgentRateLimited(`group ${msg.groupId} rate limited (retry ${rl.retryAfterS}s)`);
    }
  }

  // Session commands — intercept before spawning work / logging.
  //  - /clear|/nueva|/reset: fleetAgent-state reset (no worker turn).
  //  - /compact: forward the BARE "/compact" (no sender prefix) so the Agent SDK
  //    recognizes its built-in slash command and compacts the transcript.
  const cmd = msg.text.trim().toLowerCase();
  if (cmd === "/clear" || cmd === "/nueva" || cmd === "/reset") {
    return clearGroupSession(ctx, fleetAgent, msg.groupId);
  }
  const bareCompact = cmd === "/compact";

  await db.fleetAgentMessage.create({
    data: { fleetAgentId: fleetAgent.id, groupId: msg.groupId, role: "user", sender: msg.sender ?? null, text: msg.text },
  });

  let content = bareCompact ? "/compact" : formatContent(msg); // stable UUID → per-conversation .jsonl transcript
  let placed = await pickOrSpawn(ctx, fleetAgent, msg.groupId);
  // Config unit for key + capabilities: the number (WABA) or the conversation itself.
  const cfgId = msg.configGroupId ?? msg.groupId;

  // NATIVE Claude vision: drop the inbound image onto the worker's disk and tell
  // the agent to open it with Read (Claude is multimodal — no Gemini describe).
  // The actual write happens INSIDE the turn loop so a self-heal retry re-writes
  // it onto the fresh VM. Path is unique per turn to avoid cross-session clobber.
  let imgPath: string | null = null;
  if (msg.image && !bareCompact) {
    imgPath = `/tmp/wa-img-${placed.sessionUuid}-${Date.now()}.${msg.image.ext}`;
    const urlNote = msg.image.url ? ` (si necesitas editarla/reusarla con tus tools de imagen, su URL es ${msg.image.url})` : "";
    content = `[El usuario envió una IMAGEN. Está guardada en ${imgPath} — ÁBRELA con la tool Read para verla antes de responder.${urlNote}]\n${content}`;
  }

  let reply = "";
  // Turn loop with self-heal: if the worker's box is DEAD (host unreachable / VM
  // gone via crash/restart/TTL — not a manual delete), mark it "lost" and
  // re-place ONCE on a fresh VM (memory restored from the externalized blob). A
  // legitimate AI error rethrows. One retry max — never respawn-loop.
  for (let attempt = 1; ; attempt++) {
    const worker = placed.vm;
    const turnStart = Date.now();
    // Mark the VM busy and freshen lastMessageAt BEFORE the (possibly long) turn
    // so the reaper neither reaps it mid-flight (busyVms guard) nor in the brief
    // gap right after pickOrSpawn (lastMessageAt bump). Cleared in finally so a
    // thrown turn doesn't pin the VM busy forever.
    busyVms.add(worker.id);
    try {
      await db.agent.update({ where: { id: worker.id }, data: { lastMessageAt: new Date() } }).catch(() => {});
      // Write the inbound image onto THIS worker (re-done on a self-heal retry so
      // the fresh VM also has it) before the turn opens — so Read finds the file.
      if (imgPath && msg.image) {
        await writeFile(ctx, worker.sandboxId, { path: imgPath, content: msg.image.base64, encoding: "base64" }).catch(
          (e) => console.error(`fleetAgent image write ${imgPath} failed:`, e)
        );
      }
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
        {
          content,
          sessionId: placed.sessionUuid,
          // Per-grupo: la dnk_pub_ del org dueño de este grupo. El body gana
          // (canales web la mandan por turno); cae a fleetAgent.groupKeys[cfgId]
          // (registrado al crear el grupo, ruta WhatsApp). cfgId = configGroupId
          // (WABA: el número) o groupId (Baileys/web: la conversación misma).
          denikApiKey:
            msg.denikApiKey ??
            (fleetAgent.groupKeys as Record<string, string> | null)?.[cfgId],
          // Capa 3 (per-org) PRECEDIDA por el guardrail de plataforma fresco —
          // así el guardrail de voz llega a todos los agentes sin rebuild/migración.
          appendSystemPrompt: [PLATFORM_VOICE_GUARDRAIL, msg.admin ? ADMIN_NOTE : null, msg.appendSystemPrompt]
            .filter(Boolean)
            .join("\n\n"),
          // Per-grupo: las capacidades que este grupo habilitó (curadas ∪ custom),
          // con sus secrets resueltos del vault del dueño. El worker las mergea
          // sobre sus builtins (easybits/wa). Resuelve por cfgId (unidad de config).
          // render = SIEMPRE inyectado (no gateado por disabledBuiltins) → PDF/screenshots
          // disponibles aunque el grupo apague el MCP de easybits. El resto es per-grupo.
          mcpServers: {
            ...(await resolveGroupMcpServers(fleetAgent, cfgId, fleetAgent.ownerId)),
            ...renderMcpServer(fleetAgent),
            // admin = SOLO en turnos admin (dueño en su conversación admin de WABA).
            ...(msg.admin ? adminMcpServer(fleetAgent) : {}),
          },
          // Per-grupo: builtins apagados (ej. ["easybits"]) → el worker los quita
          // del set MCP de ese turno (forzar uso de cajas de la flota).
          disabledBuiltins: resolveDisabledBuiltins(fleetAgent, cfgId),
        }
      );
      reply = await collectStream(stream, opts.onChunk);
      auditLog("turn.ok", {
        groupId: msg.groupId,
        agentId: worker.id,
        turnMs: Date.now() - turnStart,
        replyLen: reply.length,
        attempt,
      });
      break;
    } catch (e) {
      if (attempt >= 2 || !isBoxDeadError(e)) throw e;
      auditLog("turn.boxdead", {
        groupId: msg.groupId,
        agentId: worker.id,
        err: e instanceof Error ? e.message : String(e),
      });
      await markWorkerLost(worker.id);
      placed = await pickOrSpawn(ctx, fleetAgent, msg.groupId); // fresh box, restores memory
    } finally {
      busyVms.delete(worker.id);
    }
  }
  if (bareCompact && !reply) reply = "🧹 Contexto compactado.";

  const now = new Date();
  await db.agent.update({ where: { id: placed.vm.id }, data: { lastMessageAt: now } });
  await db.fleetAgentRoute.update({
    where: { fleetAgentId_groupId: { fleetAgentId: fleetAgent.id, groupId: msg.groupId } },
    data: { lastMessageAt: now },
  });
  if (reply) {
    await db.fleetAgentMessage.create({
      data: { fleetAgentId: fleetAgent.id, groupId: msg.groupId, role: "agent", text: reply },
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
export async function reapIdleFleetAgents(): Promise<{ suspended: number; destroyed: number }> {
  let suspended = 0;
  let destroyed = 0;
  const now = Date.now();
  // Never reap a VM mid-turn (working / waiting on tools / subagents). The query
  // filters by id ∉ busy so an in-flight turn is exempt regardless of how stale
  // its lastMessageAt looks (it only refreshes at turn completion).
  const busy = [...busyVms];
  const pools = await db.fleetAgent.findMany();
  for (const fleetAgent of pools) {
    const suspendCutoff = new Date(now - fleetAgent.idleSuspendMin * 60_000);
    const destroyCutoff = new Date(now - fleetAgent.destroyIdleMin * 60_000);
    const ctx = await ctxForOwner(fleetAgent.ownerId).catch(() => null);
    if (!ctx) continue;

    // Stage 2 — destroy long-idle VMs (running or already-suspended).
    const toDestroy = await db.agent.findMany({
      where: {
        fleetAgentId: fleetAgent.id,
        status: { in: ["running", "suspended"] },
        lastMessageAt: { lt: destroyCutoff },
        id: { notIn: busy },
      },
    });
    for (const w of toDestroy) {
      try {
        // A still-running VM may hold un-backed-up turns since its last suspend —
        // back up before destroying. Suspended VMs were backed up at suspend.
        if (w.status === "running") {
          const routes = await db.fleetAgentRoute.findMany({ where: { agentId: w.id } });
          for (const r of routes) {
            await backupConversation(ctx, w, fleetAgent.id, r.sessionUuid).catch((e) =>
              console.error(`fleet reaper: backup ${r.sessionUuid} failed:`, e)
            );
          }
        }
        await db.fleetAgentRoute.updateMany({ where: { agentId: w.id }, data: { agentId: null, detachedAt: new Date() } });
        await destroySandbox(ctx, w.sandboxId);
        await db.agent.delete({ where: { id: w.id } }).catch(() => {});
        destroyed++;
      } catch (e) {
        console.error(`fleet reaper: destroy ${w.sandboxId} failed:`, e);
      }
    }

    // Stage 1 — suspend the 5–10min idle band (running VMs not just destroyed).
    const toSuspend = await db.agent.findMany({
      where: {
        fleetAgentId: fleetAgent.id,
        status: "running",
        lastMessageAt: { lt: suspendCutoff },
        id: { notIn: busy },
      },
    });
    for (const w of toSuspend) {
      try {
        const routes = await db.fleetAgentRoute.findMany({ where: { agentId: w.id } });
        for (const r of routes) {
          await backupConversation(ctx, w, fleetAgent.id, r.sessionUuid).catch((e) =>
            console.error(`fleet reaper: backup ${r.sessionUuid} failed:`, e)
          );
        }
        await suspendSandbox(ctx, w.sandboxId);
        await db.agent.update({ where: { id: w.id }, data: { status: "suspended" } });
        suspended++;
      } catch (e) {
        console.error(`fleet reaper: suspend ${w.sandboxId} failed:`, e);
      }
    }
  }
  if (suspended || destroyed) auditLog("reaper", { suspended, destroyed, busy: busy.length });
  return { suspended, destroyed };
}

// Delete a fleetAgent: destroy its worker VMs (best-effort), then remove its routes,
// messages and the fleetAgent row. Caller must disconnect the Baileys socket first
// (disconnectFleetAgent) — kept out of here to avoid a circular import.
export async function deleteFleetAgent(ctx: AuthContext, fleetAgentId: string): Promise<void> {
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || fleetAgent.ownerId !== ctx.user.id) throw new Error("fleetAgent not found");
  const workers = await db.agent.findMany({ where: { fleetAgentId } });
  for (const w of workers) {
    try {
      await destroySandbox(ctx, w.sandboxId);
      await db.agent.delete({ where: { id: w.id } }).catch(() => {});
    } catch (e) {
      // Don't drop the Agent row if the host VM survived — leave it for
      // reconciliation instead of orphaning a live VM on the box.
      console.error(`deleteFleetAgent: destroy ${w.sandboxId} failed, keeping row:`, e);
      await db.agent.update({ where: { id: w.id }, data: { status: "error" } }).catch(() => {});
    }
  }
  // Best-effort: drop the externalized memory blobs so they don't orphan.
  const routes = await db.fleetAgentRoute.findMany({ where: { fleetAgentId }, select: { sessionUuid: true } });
  for (const r of routes) {
    await memClient().deleteObject(memKey(fleetAgentId, r.sessionUuid)).catch(() => {});
  }
  await db.fleetAgentMessage.deleteMany({ where: { fleetAgentId } });
  await db.fleetAgent.delete({ where: { id: fleetAgentId } }); // FleetAgentRoute cascades
}

// Default identity for fleetAgent workers: Ghosty, español, con tools de EasyBits vía
// MCP (la llave EASYBITS_API_KEY la inyecta createAgent → el runtime arma el
// server `easybits`). Va como SYSTEM_PROMPT en persona.env (el claude-worker lo
// lee). Equivale al rol de un CLAUDE.md. Solidificar el default en el template
// (CLAUDE.md propio) es follow-up; por ahora el fleetAgent lo inyecta.
// BASE / guardrails de plataforma (formato WhatsApp, brevedad, uso de tools,
// honestidad). NO es la personalidad final: cuando llegue la customización del
// dueño (agenda #3, form de agente), su texto debe COMPONERSE ENCIMA de esto
// (append), nunca reemplazar estos guardrails — si no, se pierden el "sin
// markdown" y la brevedad. Ver [[project_pool_production_agenda]].
const GHOSTY_SYSTEM = [
  "Eres Ghosty, el asistente de EasyBits que atiende por WhatsApp.",
  "Responde SIEMPRE en español, con tono cálido y directo.",
  "SÉ BREVE. Entrega el RESULTADO, no el proceso: NO narres lo que vas a hacer ni lo que hiciste ('armando el doc…', '¡listo!', 'aquí te va el resumen de lo que hice'). Nada de relleno ni cierres tipo '¿algo más?'. Si mandas un archivo, una línea corta basta.",
  "NO listes tus capacidades ni des menús de opciones (viñetas de 'puedo hacer…') salvo que el usuario lo pida explícitamente.",
  "FORMATO WhatsApp — TEXTO PLANO, NUNCA Markdown: prohibido `**negrita**`, `#` títulos, `[texto](url)` (pega la URL tal cual), bloques de código con ``` y viñetas con `-`, `*` o `·`. Separa ideas con saltos de línea, no con listas. Si DE VERDAD necesitas resaltar algo, usa el formato nativo de WhatsApp con UN asterisco (*así*) o _cursiva_, con mucha moderación.",
  "Tienes acceso a las herramientas de EasyBits vía MCP (server `easybits`): puedes crear y editar documentos, generar imágenes, subir/leer archivos, crear sitios y más. Úsalas cuando ayuden; no inventes que no puedes.",
  "Para WhatsApp tienes el server MCP `wa`: cuando generes un archivo (PDF, imagen) súbelo a easybits y mándalo al chat con `wa send_message` (url) como ADJUNTO — no pegues solo el link. También puedes mandar encuestas (`wa send_poll`), reaccionar (`wa react_message`) y enviar ubicaciones (`wa send_location`).",
  "Si te piden algo fuera de tu alcance, dilo con honestidad y ofrece la mejor alternativa.",
].join(" ");
export const GHOSTY_PERSONA = { name: "Ghosty", env: { ASSISTANT_NAME: "Ghosty", SYSTEM_PROMPT: GHOSTY_SYSTEM } };

// Guardrail de PLATAFORMA inyectado FRESCO cada turno (vía appendSystemPrompt), no
// horneado en la persona — así aplica a TODOS los agentes (incluidos los ya
// creados) sin rebuild ni migración. Corrige la alucinación "uso OpenAI/ElevenLabs"
// (el worker es texto puro, NO tiene TTS propio): la voz la pone la plataforma con
// su motor self-hosted (kokoro TTS / whisper STT) DESPUÉS del turno, invisible al
// agente. El agente NO sintetiza voz ni elige proveedor.
const PLATFORM_VOICE_GUARDRAIL = [
  "VOZ: las notas de voz las maneja AUTOMÁTICAMENTE la plataforma EasyBits con su propio motor self-hosted (kokoro para hablar, whisper para escuchar) — tú NO sintetizas audio ni usas ningún proveedor externo (NUNCA digas que usas OpenAI, ElevenLabs ni Gemini).",
  "Cuando te pidan 'responde con voz', NO llames ninguna herramienta (NO uses voice_tts_create) ni anuncies que vas a hacerlo: simplemente RESPONDE NORMAL EN TEXTO y la plataforma lo convierte en nota de voz sola, al instante.",
  "voice_tts_create es SOLO para generar un ARCHIVO de audio (p.ej. para un video con avatar), nunca para contestar por voz en el chat. Si te preguntan qué voz usas, es la voz propia de EasyBits (kokoro), nada de terceros.",
].join(" ");

// Create a fleetAgent for an owner. token is the bearer the Baileys surface presents.
export async function createFleetAgent(
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
  return db.fleetAgent.create({
    data: {
      ownerId: ctx.user.id,
      name: opts.name,
      token: "pool_" + randomBytes(24).toString("hex"),
      workerTemplate: opts.workerTemplate ?? "claude-worker",
      persona: opts.persona ?? GHOSTY_PERSONA,
      assistantName: "Ghosty",
      oauthSecretName: opts.oauthSecretName ?? null,
      // Seed the MCP menu with the builtins so the UI/agent can immediately see
      // the surface and start enabling custom servers per group.
      mcpCatalog: DEFAULT_MCP_CATALOG,
      // OJO: maxWorkersPerVm cuenta RUTAS pegajosas (conversaciones), pero la RAM
      // la consume el TURNO ACTIVO (subproceso claude). Entre turnos el subproceso
      // sale → una ruta dormida cuesta ~0 RAM (solo disco). Medición real 2026-06-24
      // (scripts/fleetAgent-vm-rss-probe.ts): baseline VM 182MB + ~221MB por turno LIGERO
      // (sin tools); presupuesta ~450MB/turno con MCP/tool calls. 4 turnos ligeros
      // concurrentes = 1059MB (53% de 2GB); 4 pesados ≈ 1982MB ≈ 99% (al borde →
      // semáforo encola el 5º). Densidad ~512MB/agente, en pares: 1GB→2, 2GB→4,
      // 4GB→8. 512MB NO alcanza ni para 1 turno con tools.
      maxWorkersPerVm: opts.maxWorkersPerVm ?? 4,
      vmMemMb: opts.vmMemMb ?? 2048,
      maxVms: opts.maxVms ?? 10,
      // suspend@2min libera RAM (el subproceso ya salió entre turnos; suspender
      // solo congela el baseline) y deja la VM RESUMIBLE: medido 700-950ms desde
      // suspend (snapshot Firecracker) vs ~12s de cold boot + restore-desde-S3.
      // Por eso destroy@45min y no @3: el disco aguanta (hay box de sobra) y el
      // win real es que un mensaje tras un hueco de minutos arranca sub-segundo en
      // vez de re-bootear. La memoria igual se externaliza a S3 (round-trip probado
      // byte-a-byte, scripts/fleet-memory-roundtrip.ts), así que destruir sigue
      // siendo seguro — solo lo posponemos para cobrar el resume caliente.
      idleSuspendMin: opts.idleSuspendMin ?? 2,
      destroyIdleMin: opts.destroyIdleMin ?? 45,
    },
  });
}
