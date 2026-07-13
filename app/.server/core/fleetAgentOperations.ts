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
import { engineHasVision, getEngineForAgent, getEngine } from "~/lib/fleetEngines";
import { profileToToolsParam, DEFAULT_PROFILE, GROUP_ALLOWLISTS, type ToolGroupKey } from "~/.server/mcp/toolGroups";
import { getPlatformDefaultClient, buildPublicAssetUrl } from "~/.server/storage";
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

// ── Modelo del CLI para los workers de la flota ───────────────────────────────
// FUENTE ÚNICA. El worker (claude-worker) corre el Agent SDK sobre el OAuth Max
// del dueño (tarifa plana, no medido); el CLI honra ANTHROPIC_MODEL. Se inyecta
// UNA vez en el env del spawn (spawnVm). Override por-agente vía
// persona.env.ANTHROPIC_MODEL. El worker no manda sampling params, así que
// Sonnet 5 (adaptive thinking on) es un swap limpio. Lectura de env, no throw a
// nivel de módulo → no rompe el prerender del Docker build.
export const FLEET_DEFAULT_MODEL = process.env.FLEET_MODEL || "claude-sonnet-5";

// Effort del CLI para los workers. El default de Claude Code es xhigh → el modelo
// piensa al máximo ANTES del primer token = dead-air en chat (GTeams se sentía lento
// vs Claude-tag-en-Slack; Sonnet 5 corre thinking adaptativo ON por default). "medium"
// = balance snappy/calidad para el grueso del tráfico (chat/booking). El worker lo lee
// de FLEET_EFFORT y lo pasa al SDK (ver provider.ts). Override por-agente vía
// persona.env.FLEET_EFFORT ("high"/"xhigh" para docs pesados, "low" para puro chat) o
// persona.env.FLEET_THINKING="disabled" para apagarlo del todo.
export const FLEET_DEFAULT_EFFORT = process.env.FLEET_EFFORT || "medium";

// Identidad del modelo, inyectada FRESCA por turno (como el guardrail de voz) para
// que el agente sepa sobre qué corre y responda bien si le preguntan "¿qué IA eres?".
// Solo se inyecta cuando el modelo RESUELTO del agente es claude-sonnet-5 (el
// default) — un agente que overridea ANTHROPIC_MODEL no recibe una afirmación falsa.
export const MODEL_IDENTITY_SONNET5 = [
  "MODELO: corres sobre Claude Sonnet 5 (claude-sonnet-5), el modelo Sonnet más reciente de Anthropic — NO eres GPT, Gemini, Llama ni una versión vieja de Claude.",
  "Tus características: rápido, con calidad cercana a Claude Opus en razonamiento, código y uso de herramientas; ventana de contexto de 1M tokens; razonamiento adaptativo (adaptive thinking) integrado; visión de alta resolución; sigues instrucciones de forma literal y precisa.",
  "Si te preguntan qué modelo o IA eres, responde: Claude Sonnet 5, de Anthropic.",
].join(" ");

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

// ── Auto-compact ───────────────────────────────────────────────────────────────
// The worker's Agent SDK .jsonl transcript is APPEND-ONLY (same failure mode as
// NanoClaw): it grows without bound, inflating cold-spawn restore, per-suspend
// backup I/O (whole tgz base64'd through the host exec channel), and microVM RSS.
// After a turn we measure the jsonl; if it crosses the threshold we flag the
// session, and the NEXT turn injects a bare "/compact" (SDK-native, in-place,
// same sticky sessionUuid) before the user's message. In-memory Set keyed by
// sessionUuid, single-instance like busyVms — see the scaling caveat on the reaper.
const pendingCompact = new Set<string>();
const COMPACT_THRESHOLD_BYTES = Number(process.env.FLEET_COMPACT_THRESHOLD_BYTES) || 4_000_000;

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

// Byte size of the conversation's SDK transcript on the VM (0 if missing/error).
// Cheap read-only stat; used to decide when to auto-compact. Best-effort.
async function measureJsonlBytes(
  ctx: AuthContext,
  vm: { sandboxId: string },
  sessionUuid: string
): Promise<number> {
  const jsonl = `/data/.claude/projects/-data-workspaces-${sessionUuid}/${sessionUuid}.jsonl`;
  try {
    const r = await execCommand(ctx, vm.sandboxId, {
      command: `stat -c%s "${jsonl}" 2>/dev/null || echo 0`,
      timeoutSeconds: 10,
    });
    return Number(String((r as any).stdout ?? "0").trim()) || 0;
  } catch {
    return 0;
  }
}

// Sweep orphan memory blobs: fleet-memory/<fleetAgentId>/<sessionUuid>.tgz with
// no live FleetAgentRoute. Backups written for since-detached routes, failed
// best-effort deletes, and stale sessions accumulate in S3 forever otherwise.
// Grace window (1h): never touch a fresh blob — a just-backed-up conversation
// whose route write hasn't landed yet must not be reaped.
export async function sweepOrphanFleetMemory(): Promise<{ scanned: number; deleted: number }> {
  const objects = await memClient().listObjects().catch(() => [] as { key: string; lastModified?: Date }[]);
  if (!objects.length) return { scanned: 0, deleted: 0 };
  const routes = await db.fleetAgentRoute.findMany({ select: { fleetAgentId: true, sessionUuid: true } });
  const live = new Set(routes.map((r) => `${r.fleetAgentId}/${r.sessionUuid}`));
  const graceCutoff = Date.now() - 60 * 60_000;
  let deleted = 0;
  for (const o of objects) {
    const id = o.key.replace(/\.tgz$/, ""); // "<fleetAgentId>/<sessionUuid>"
    if (live.has(id)) continue;
    if (o.lastModified && o.lastModified.getTime() > graceCutoff) continue; // too fresh
    await memClient().deleteObject(o.key).then(() => { deleted++; }).catch(() => {});
  }
  if (deleted) auditLog("mem.sweep", { scanned: objects.length, deleted });
  return { scanned: objects.length, deleted };
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
  // Nombre de perfil del contacto (WABA: contacts[].profile.name) — para el Inbox.
  senderName?: string;
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
  // Full media surface (A2A FileParts) — canales como GTeams entregan CUALQUIER
  // media (imagen/audio/video/pdf/doc/desconocido) uniformemente por MIME, con los
  // bytes inline (`bytes`, base64) o por URL firmada (`uri`). routeMessage los resuelve:
  // audio sin texto → transcribe; el resto se escribe al worker (Read). Contrato:
  // ghosty-chat/docs/AGENT-MEDIA-CONTRACT.md.
  files?: { name?: string; mimeType: string; uri?: string; bytes?: string }[];
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
  // How the capability reaches the agent:
  //  "mcp"  → an MCP server (stdio/http) exposes tools (default; kommo/skydropx/brightdata)
  //  "code" → NO server. The owner's API key is injected into the worker env and a
  //           skillDoc tells the agent to hit the REST API from Bash (elevenlabs, any API).
  //           The leanest replicable connector: most vendors have API+key, not an MCP.
  mode?: "mcp" | "code";
  transport?: "stdio" | "http";
  command?: string; // stdio: e.g. "npx"
  args?: string[]; // stdio: e.g. ["-y", "@brightdata/mcp"]
  url?: string; // http: remote MCP endpoint
  // env values may reference a vault secret as "$secret:NAME" — resolved per-turn
  // from the owner's vault (never stored raw). Non-secret values pass through.
  // For mode:"code" these are injected into the worker's turn env verbatim.
  env?: Record<string, string>;
  requiredSecrets?: string[]; // vault secret names this capability needs to work
  // Human-facing metadata for each secret so the OWNER never sees the internal env
  // var name — the UI asks for "Access token de Kommo" (+ where to find it) and we
  // store it under the internal name automatically. Keyed by the internal name.
  secretFields?: Record<string, { label: string; help?: string }>;
  // Access LEVELS declared by the connector — NOT a fixed read/write. Each level
  // maps to a set of toolset names emitted as `<SERVER>_TOOLSETS`, and MAY be
  // scoped per-conversation (scopeByJid). Kommo's ladder mirrors sofi-0's WABA:
  // Lectura → Acotada (create + edit ONLY leads THIS conversation created, via
  // scopeByJid) → Admin (everything, no scope). The UI renders whatever levels the
  // connector declares (+ implicit Off). Absent = simple on/off capability.
  toolsets?: {
    envVar: string;
    levels: { key: string; label: string; toolsets: string[]; scopeByJid?: boolean }[];
    // When a level is scoped, emit these env vars: `flag`=1 + `jid`=<groupId> so
    // the connector tags/verifies ownership per conversation.
    scopeEnv?: { flag: string; jid: string };
  };
  // mode:"code" — markdown appended to the turn's system prompt telling the agent
  // how to call the API (base URL, auth header, key env var, common endpoints).
  skillDoc?: string;
  builtin?: boolean; // easybits/wa — always-on, not togglable
  // Canal al que ESTÁ atado este builtin (ej. "wa" = Baileys/WhatsApp por QR). Un
  // consumidor de otro canal (GTeams web/teams) debe OCULTARLO: sus tools solo sirven
  // pareado a WhatsApp, y el runtime ya lo fuerza-apaga fuera de Baileys. Ausente =
  // agnóstico al canal (easybits: archivos/docs/imágenes, sirve en todos lados).
  channel?: string;
  // El SURFACE de este builtin ES los tool buckets (HERRAMIENTAS): easybits expone
  // exactamente esos grupos, así que un toggle on/off aparte es redundante con el
  // granular. Un consumidor con picker de buckets (GTeams) debe OCULTARLO — los
  // buckets ya lo prenden/apagan. Ver intent set-group-toolgroup.
  bucketScoped?: boolean;
};
export type GroupConfig = {
  mcpServers?: string[];
  env?: Record<string, string>;
  disabledBuiltins?: string[];
  toolGroup?: string;
  // Per-tool DENY dentro de los buckets activos. Default = todas las tools del bucket
  // ON; el user destila herramientas puntuales → van aquí. Se codifican como `-<tool>`
  // en el `?tools=` (resolveToolGroup) → el MCP endpoint las deshabilita ese turno.
  toolDeny?: string[];
  // Per enabled capability, the chosen LEVEL KEY (declared by the connector, e.g.
  // kommo: "read" | "scoped" | "admin"). Absent → the connector's first level.
  // Drives <SERVER>_TOOLSETS (+ scope env). This is how "admin desde baileys /
  // acotado desde waba" becomes pure config.
  capLevels?: Record<string, string>;
  // Per-channel append to the system prompt (layer 3, appended never overwritten).
  systemPrompt?: string;
  // S3 asset library: file IDs (EasyBits public files) the agent may deliver in
  // this channel. Reemplaza el group-FS de nanoclaw (catálogos/imágenes). Se
  // inyecta como manifiesto (nombre → URL) en el prompt del turno.
  assets?: string[];
  // Scope del bucket DB: namespaces permitidos ("decirle CUÁL base"). Vacío/ausente
  // = todas. Se inyecta al prompt del turno (enforcement duro en el MCP = follow-up).
  dbAllow?: string[];
  // Marca de "canal en uso" — ISO del primer turno visto en este cfgId. Solo la usa
  // el canal Teams (cfgId "teams") hoy: EasyBits no sabe de la conexión (vive en
  // GTeams), así que la infiere del primer mensaje. Prende el indicador en /dash/flota.
  connectedAt?: string;
};

// Builtins (easybits/wa) the group turned OFF. Absent/[] = all builtins ON
// (backward-compatible default). The worker removes these from its merged MCP set
// for that group's turn — e.g. ["easybits"] forces the agent onto fleet service
// boxes instead of the EasyBits MCP. Keyed by the same groupId/cfgId as mcpServers.
export function resolveDisabledBuiltins(
  fleetAgent: { groupConfigs?: unknown },
  groupId: string
): string[] {
  const cfg = ((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {})[groupId] ?? {};
  const disabled = [...(cfg.disabledBuiltins ?? [])];
  // WABA y Teams NO usan el MCP `wa` (Baileys in-process): el envío va por otra vía
  // (WABA→Formmy, Teams→A2A/GTeams; URLs en el texto → adjuntos). Sin esto el agente
  // VE `wa` en su toolset → la heurística de canal del prompt ("si tengo wa, estoy en
  // WhatsApp") misfirea en Teams → responde texto plano + intenta `wa send_message`.
  // Forzado siempre para esos canales (mismo criterio que la entrega no-Baileys).
  const noWaChannel = groupId.startsWith("waba:") || groupId === "teams";
  if (noWaChannel && !disabled.includes("wa")) disabled.push("wa");
  return disabled;
}

// Tool group (?tools= surface de EasyBits) PER-NÚMERO/grupo: el override per-grupo
// gana sobre el default del agente (clave "*"). undefined → el worker usa su env
// EASYBITS_TOOL_GROUP (default del agente, baked al spawn). Keyed por cfgId.
export function resolveToolGroup(
  fleetAgent: { groupConfigs?: unknown },
  groupId: string
): string | undefined {
  const all = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
  // El cfg que provee el toolGroup (per-grupo gana sobre "*") es también quien
  // aporta el deny → van juntos para no mezclar buckets de un cfg con deny de otro.
  const cfg = all[groupId]?.toolGroup != null ? all[groupId] : all["*"];
  const base = cfg?.toolGroup;
  if (!base) return undefined;
  const deny = (cfg?.toolDeny ?? []).filter(Boolean);
  return deny.length ? [base, ...deny.map((t) => `-${t}`)].join(",") : base;
}

// $secret:NAME reference shape (same as agentOperations.expandMcpServerSecrets).
const SECRET_REF_RE = /^\$secret:([A-Z_][A-Z0-9_]*)$/;

// Base URL for EasyBits-hosted connector MCP endpoints (kommo/skydropx proxies).
// Defined here (above CURATED_CAPABILITIES) so module-level catalog URLs resolve.
const appBaseUrl = () =>
  (process.env.BASE_URL || process.env.EASYBITS_URL || process.env.SITE_URL || "https://www.easybits.cloud").replace(/\/$/, "");

// Builtins seeded on every fleetAgent: easybits + wa are ALWAYS active in the worker
// (baked env / in-process), not togglable. NO denik here — denik's per-group org
// key is a reseller-only path (groupKeys + denikApiKey), invisible to the generic UI.
export const DEFAULT_MCP_CATALOG: McpCatalogEntry[] = [
  { name: "easybits", label: "EasyBits — archivos, docs, imágenes", transport: "stdio", command: "npx", args: ["-y", "@easybits.cloud/mcp"], builtin: true, bucketScoped: true },
  { name: "wa", label: "Personal y grupos (QR) — enviar archivos, encuestas, reacciones", transport: "stdio", builtin: true, channel: "baileys" },
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
  {
    // Kommo CRM — MCP hospedado por EasyBits (proxy a la API de Kommo con la llave
    // del owner). Tri-estado: Lectura = leer leads/contactos; Escritura = crear/mover
    // leads, notas, pipeline. Emitido como KOMMO_TOOLSETS al server.
    // stdio npx — el server MCP de kommo (portado de nanoclaw, publicado a npm).
    // Las ~20 tools se auto-descubren; NO se registran a mano. Tri-estado → KOMMO_TOOLSETS.
    name: "kommo",
    label: "Kommo CRM — leads, contactos, pipeline",
    description: "Leer y gestionar leads, contactos y pipeline de tu cuenta Kommo.",
    mode: "mcp",
    transport: "stdio",
    command: "npx",
    args: ["-y", "nanoclaw-kommo-mcp"],
    env: {
      KOMMO_ACCESS_TOKEN: "$secret:KOMMO_ACCESS_TOKEN",
      KOMMO_BASE_URL: "$secret:KOMMO_BASE_URL",
    },
    requiredSecrets: ["KOMMO_ACCESS_TOKEN", "KOMMO_BASE_URL"],
    secretFields: {
      KOMMO_ACCESS_TOKEN: { label: "Access token de Kommo", help: "Kommo → Ajustes → Integraciones → tu integración privada → Token de larga duración" },
      KOMMO_BASE_URL: { label: "URL de tu cuenta Kommo", help: "Ej. https://tuempresa.kommo.com" },
    },
    toolsets: {
      envVar: "KOMMO_TOOLSETS",
      scopeEnv: { flag: "KOMMO_SCOPE_BY_JID", jid: "NANOCLAW_CHAT_JID" },
      levels: [
        { key: "read", label: "Lectura", toolsets: ["read"] },
        // Acotado = el default de los WABA de sofi-0: crea y edita/mueve SOLO los
        // leads que creó en ESTA conversación (scopeByJid), nunca los de otros.
        { key: "scoped", label: "Acotado", toolsets: ["read", "create", "scoped-mutate"], scopeByJid: true },
        { key: "admin", label: "Admin", toolsets: ["read", "read-leads", "create", "scoped-mutate", "admin"] },
      ],
    },
  },
  {
    // Formmy CRM — levanta órdenes/pedidos, mueve el tablero (kanban de brendi) y
    // guarda datos fiscales/de envío del cliente en el CRM de Formmy. ESTÁNDAR como
    // kommo: el dueño mete su Secret Key de Formmy (formmy_sk_live_…) en el vault
    // (llavesita); el MCP escribe por /api/v2/sdk autenticado con esa llave.
    // El conversationId se resuelve SOLO: el MCP lee NANOCLAW_CHAT_JID
    // (waba:<integrationId>:<phone>, inyectado por scopeByJid) → conversations.resolveByPhone.
    name: "formmy",
    label: "Formmy CRM — órdenes y tablero",
    description: "Levantar pedidos, mover el tablero y guardar datos del cliente en tu CRM de Formmy.",
    mode: "mcp",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@formmy.app/mcp-server"],
    env: {
      FORMMY_API_URL: "https://formmy.app",
      FORMMY_SECRET_KEY: "$secret:FORMMY_SECRET_KEY",
    },
    requiredSecrets: ["FORMMY_SECRET_KEY"],
    secretFields: {
      FORMMY_SECRET_KEY: {
        label: "Secret Key de Formmy",
        help: "Formmy → dashboard → API/SDK → tu Secret Key (empieza con formmy_sk_live_).",
      },
    },
    toolsets: {
      envVar: "FORMMY_TOOLSETS",
      // scopeByJid siempre ON → inyecta NANOCLAW_CHAT_JID = groupId
      // (waba:INTEG:PHONE) por-conversación, que el MCP usa para resolver la conv.
      scopeEnv: { flag: "FORMMY_SCOPE_BY_JID", jid: "NANOCLAW_CHAT_JID" },
      levels: [
        {
          key: "board",
          label: "Tablero (órdenes + contacto)",
          toolsets: ["orders", "contacts"],
          scopeByJid: true,
        },
      ],
    },
  },
  {
    name: "skydropx",
    label: "Skydropx — cotizar y generar envíos",
    description: "Cotizar guías y generar envíos con Skydropx.",
    mode: "mcp",
    transport: "stdio",
    command: "npx",
    args: ["-y", "nanoclaw-skydropx-mcp"],
    env: {
      SKYDROPX_CLIENT_ID: "$secret:SKYDROPX_CLIENT_ID",
      SKYDROPX_CLIENT_SECRET: "$secret:SKYDROPX_CLIENT_SECRET",
    },
    requiredSecrets: ["SKYDROPX_CLIENT_ID", "SKYDROPX_CLIENT_SECRET"],
    secretFields: {
      SKYDROPX_CLIENT_ID: { label: "Client ID de Skydropx", help: "Skydropx PRO → Conexiones → API" },
      SKYDROPX_CLIENT_SECRET: { label: "Client Secret de Skydropx", help: "Mismo panel de Conexiones > API" },
    },
    toolsets: {
      envVar: "SKYDROPX_TOOLSETS",
      levels: [
        { key: "quote", label: "Cotizar", toolsets: ["quote"] },
        { key: "create", label: "Cotizar + generar", toolsets: ["quote", "create"] },
      ],
    },
  },
  {
    // MercadoPago — code-mode. Links de cobro vía API con la llave del owner.
    name: "mercadopago",
    label: "MercadoPago — links de cobro",
    description: "Generar links de pago con MercadoPago (usa tu access token).",
    mode: "code",
    env: { MP_ACCESS_TOKEN: "$secret:MP_ACCESS_TOKEN" },
    requiredSecrets: ["MP_ACCESS_TOKEN"],
    skillDoc: [
      "## MercadoPago — link de cobro (code-mode)",
      "Tienes `$MP_ACCESS_TOKEN`. Para un link de pago corre por Bash:",
      '```bash',
      'curl -s -X POST "https://api.mercadopago.com/checkout/preferences" \\',
      '  -H "Authorization: Bearer $MP_ACCESS_TOKEN" -H "Content-Type: application/json" \\',
      `  -d '{"items":[{"title":"Cotización","quantity":1,"unit_price":1234.0,"currency_id":"MXN"}]}'`,
      '```',
      "La respuesta trae `init_point` (URL de pago). Mándasela al cliente en el mensaje.",
    ].join("\n"),
  },
  {
    // ElevenLabs — code-mode. Sin MCP: la llave se inyecta al env del turno y el
    // skillDoc le dice al agente cómo pegarle a la API por Bash. Kokoro sigue
    // canal-side; esto es TTS premium que el agente invoca a voluntad.
    name: "elevenlabs",
    label: "ElevenLabs — voz premium (TTS)",
    description: "Texto a voz con las voces premium de ElevenLabs (usa tu llave).",
    mode: "code",
    env: { ELEVENLABS_API_KEY: "$secret:ELEVENLABS_API_KEY" },
    requiredSecrets: ["ELEVENLABS_API_KEY"],
    skillDoc: [
      "## ElevenLabs TTS (code-mode)",
      "Tienes `$ELEVENLABS_API_KEY` en el env. Para generar audio, corre por Bash:",
      '```bash',
      'curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" \\',
      '  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \\',
      `  -d '{"text":"...","model_id":"eleven_multilingual_v2"}' -o /tmp/out.mp3`,
      '```',
      "Lista voces: `GET https://api.elevenlabs.io/v1/voices`. Sube el mp3 con upload_file y envíalo.",
    ].join("\n"),
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
  const all = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
  const cfg = all[groupId] ?? {};
  // Default por-AGENTE bajo la clave reservada "*" (la edita el drawer de perfil):
  // un grupo SIN config propia hereda ese default; un grupo con `mcpServers`
  // explícito (override de la modal Capacidades) GANA, aunque sea []. Un groupId
  // real (jid / uuid / waba:…) nunca es "*", así que no colisiona.
  const enabled = cfg.mcpServers ?? all["*"]?.mcpServers;
  if (!enabled?.length) return undefined;
  // env del grupo: el del grupo específico, o el del default si hereda.
  const cfgEnv = cfg.mcpServers ? cfg.env : (cfg.env ?? all["*"]?.env);
  const caps = mergedCapabilities(fleetAgent);
  const levels = (cfg.mcpServers ? cfg.capLevels : (cfg.capLevels ?? all["*"]?.capLevels)) ?? {};
  const out: Record<string, unknown> = {};
  for (const e of caps) {
    if (e.builtin || !enabled.includes(e.name)) continue;
    if (e.mode === "code") continue; // code-mode = no MCP server (see resolveGroupCodeCaps)
    const rawEnv = { ...(e.env ?? {}), ...(cfgEnv ?? {}) };
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
    // Chosen level → <SERVER>_TOOLSETS (+ per-conversation scope env when the level
    // is scoped, e.g. kommo "acotado" = KOMMO_SCOPE_BY_JID=1 + NANOCLAW_CHAT_JID).
    if (e.toolsets) {
      const lvl =
        e.toolsets.levels.find((l) => l.key === levels[e.name]) ?? e.toolsets.levels[0];
      env[e.toolsets.envVar] = lvl.toolsets.join(",");
      if (lvl.scopeByJid && e.toolsets.scopeEnv) {
        env[e.toolsets.scopeEnv.flag] = "1";
        env[e.toolsets.scopeEnv.jid] = groupId;
      }
    }
    out[e.name] =
      e.transport === "http"
        ? { type: "http", url: e.url, ...(Object.keys(env).length ? { env } : {}) }
        : { type: "stdio", command: e.command, args: e.args ?? [], env };
  }
  return Object.keys(out).length ? out : undefined;
}

// Code-mode capabilities enabled for this group → the plaintext env vars to inject
// into the worker's turn + the skillDocs to append to the system prompt. Same
// enable/inherit/secret-resolution rules as resolveGroupMcpServers; a cap whose
// required secret is missing is skipped. Returns null if none.
export async function resolveGroupCodeCaps(
  fleetAgent: { mcpCatalog?: unknown; groupConfigs?: unknown },
  groupId: string,
  ownerId: string
): Promise<{ env: Record<string, string>; skillDocs: string[] } | null> {
  const all = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
  const cfg = all[groupId] ?? {};
  const enabled = cfg.mcpServers ?? all["*"]?.mcpServers;
  if (!enabled?.length) return null;
  const caps = mergedCapabilities(fleetAgent);
  const env: Record<string, string> = {};
  const skillDocs: string[] = [];
  for (const e of caps) {
    if (e.mode !== "code" || !enabled.includes(e.name)) continue;
    const resolved: Record<string, string> = {};
    let missing = false;
    for (const [k, v] of Object.entries(e.env ?? {})) {
      const m = SECRET_REF_RE.exec(v);
      if (!m) { resolved[k] = v; continue; }
      const val = await getSecretValue(ownerId, m[1]).catch(() => null);
      if (val == null) { missing = true; break; }
      resolved[k] = val;
    }
    if (missing) continue;
    Object.assign(env, resolved);
    if (e.skillDoc) skillDocs.push(e.skillDoc);
  }
  return Object.keys(env).length || skillDocs.length ? { env, skillDocs } : null;
}

// S3 asset library → a manifest string for the turn's system prompt. The owner
// picks which public EasyBits files this channel may deliver; the agent sends the
// listed URLs (replaces nanoclaw's group filesystem catalogs). Group override wins
// over the agent default ("*"). Returns null if none configured.
export async function resolveGroupAssetManifest(
  fleetAgent: { groupConfigs?: unknown },
  groupId: string,
  extraFileIds: string[] = []
): Promise<string | null> {
  const all = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
  const channel = all[groupId]?.assets ?? all["*"]?.assets ?? [];
  // Los files de los skills encendidos entran SIEMPRE al manifiesto (aunque el canal
  // no adjunte assets) → el agente puede leer el SKILL.md + descargar el script.
  const ids = [...new Set([...channel, ...extraFileIds])];
  if (!ids?.length) return null;
  const files = await db.file
    .findMany({ where: { id: { in: ids }, status: { not: "DELETED" } }, select: { name: true, storageKey: true, access: true } })
    .catch(() => []);
  const lines = files
    .filter((f) => f.access === "public")
    .map((f) => `- ${f.name}: ${buildPublicAssetUrl(f.storageKey)}`);
  if (!lines.length) return null;
  return [
    "## Archivos disponibles para enviar",
    "Estos archivos ya están hospedados. Para enviarlos, incluye su URL en el mensaje (la plataforma los adjunta). NO los regeneres.",
    ...lines,
  ].join("\n");
}

// Agent Skill (custom-tool por tenant). Bundle de archivos + metadata del frontmatter.
export type FleetSkill = {
  id: string;
  name: string;
  description: string;
  files: string[]; // fileIds; [0] = SKILL.md, el resto scripts/assets
  enabled?: boolean;
};

export function fleetSkills(fleetAgent: { skills?: unknown }): FleetSkill[] {
  return ((fleetAgent.skills as FleetSkill[] | null) ?? []).filter((s) => s && s.id && s.name);
}

// Progressive disclosure: los name+description de los skills ENCENDIDOS se inyectan
// al prompt del turno; el SKILL.md completo + scripts se leen on-demand (sus files
// van al manifiesto de assets). Devuelve el bloque de prompt + los fileIds a mergear.
export async function resolveSkillsPrompt(
  fleetAgent: { skills?: unknown }
): Promise<{ prompt: string | null; fileIds: string[] }> {
  const skills = fleetSkills(fleetAgent).filter((s) => s.enabled !== false);
  if (!skills.length) return { prompt: null, fileIds: [] };
  const fileIds = [...new Set(skills.flatMap((s) => s.files ?? []))];
  const firstIds = skills.map((s) => s.files?.[0]).filter(Boolean) as string[];
  const mdFiles = firstIds.length
    ? await db.file.findMany({ where: { id: { in: firstIds } }, select: { id: true, name: true } }).catch(() => [])
    : [];
  const nameById = new Map(mdFiles.map((f) => [f.id, f.name]));
  const lines = skills.map((s) => {
    const md = s.files?.[0] ? nameById.get(s.files[0]) : null;
    return `- **${s.name}**: ${s.description}${md ? ` → cuando aplique, LEE '${md}' de tus archivos y síguela al pie (corre el script que indique; no improvises ni calcules a mano).` : ""}`;
  });
  return {
    prompt: ["## Skills disponibles", "Tienes estas capacidades empaquetadas. Úsalas cuando el caso lo pida:", ...lines].join("\n"),
    fileIds,
  };
}

// Scope de bases de datos por canal → nota para el prompt del turno ("decirle CUÁL
// base"). Enforcement duro (rechazo en el MCP) = follow-up; hoy es prompt-scoped.
export function resolveGroupDbScope(
  fleetAgent: { groupConfigs?: unknown },
  groupId: string
): string | null {
  const all = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
  // Filtra namespaces vacíos/whitespace: un dbAllow guardado como [""] (junk de un
  // save previo) era TRUTHY y ganaba sobre el wildcard, inyectando una allowlist con
  // un namespace vacío → el agente reportaba "lista de namespaces permitidos vacía".
  // Si el grupo no tiene entradas reales, HEREDA la config "*" (la que pone la UI).
  const clean = (a?: string[]) => a?.filter((s) => s && s.trim());
  const own = clean(all[groupId]?.dbAllow);
  const allow = own?.length ? own : clean(all["*"]?.dbAllow);
  if (!allow?.length) return null;
  return `## Bases de datos permitidas\nSOLO puedes usar estas bases de datos (namespaces): ${allow.join(", ")}. NO toques ninguna otra.`;
}

// Manifiesto de tools REALES activas para el turno. En Code Mode (`scripting`) el
// tools/list es LEAN (solo discover_tools/run_tool + IO) → el agente NO ve sus tools
// de documentos/imágenes/etc. y, si le preguntan qué puede hacer, inventa features
// genéricas de EasyBits. Este manifiesto (calculado desde el toolGroup efectivo +
// deny, MISMA lógica que el MCP endpoint) le dice EXACTAMENTE qué tiene → deja de
// inflar. Se inyecta al prompt del turno como assetManifest/dbScope (sin rebake).
export function resolveGroupToolsManifest(
  fleetAgent: { groupConfigs?: unknown; persona?: unknown },
  groupId: string
): string | null {
  const effective =
    resolveToolGroup(fleetAgent, groupId) ??
    (fleetAgent.persona as Persona | null)?.env?.EASYBITS_TOOL_GROUP;
  if (!effective) return null;
  const parts = effective.split(",").map((s) => s.trim()).filter(Boolean);
  const deny = new Set(parts.filter((p) => p.startsWith("-")).map((p) => p.slice(1)));
  const groups = parts.filter((p) => !p.startsWith("-"));
  if (groups.includes("all")) return null; // sin restricción → nada que enumerar
  const tools = new Set<string>();
  for (const g of groups) {
    const al = GROUP_ALLOWLISTS[g as ToolGroupKey];
    if (al) for (const t of al) if (!deny.has(t)) tools.add(t);
  }
  if (!tools.size) return null;
  const list = [...tools].sort();
  return (
    `## Tus herramientas EasyBits activas (${list.length})\n` +
    `Estas son las ÚNICAS herramientas de EasyBits que tienes en este turno: ${list.join(", ")}.\n` +
    `NO afirmes ni ofrezcas capacidades fuera de esta lista; si te preguntan qué puedes hacer, ` +
    `básate SOLO en estas tools (sin inventar). Si una acción requiere una tool que no está aquí, ` +
    `di claramente que no la tienes activada. Además siempre tienes render de PDF/imágenes y edición de artefactos.`
  );
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

// Artifact MCP server — edit-in-place de artefactos vivos (doc). Mismo patrón que
// renderMcpServer (HTTP, auth = fleetAgent token), inyectado INCONDICIONAL en todo
// turno → el agente crea/actualiza documentos con identidad + versiones.
function artifactMcpServer(fleetAgent: { id: string; token: string }): Record<string, unknown> {
  const base = (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
  const url = `${base}/api/v2/fleet-artifact/${fleetAgent.id}/mcp?token=${encodeURIComponent(fleetAgent.token)}`;
  return {
    artifact: { type: "http", url, headers: { Authorization: `Bearer ${fleetAgent.token}` } },
  };
}

// Vision MCP server — `see_image` (Gemini vision + OCR) para que un motor TEXT-ONLY
// (DeepSeek/GLM/Codex-worker) pueda VER una imagen en vez de confabular su contenido.
// Mismo patrón que renderMcpServer (HTTP, auth = fleetAgent token), inyectado
// INCONDICIONAL en todo turno → siempre ofrecida (un motor multimodal simplemente
// no la llama). El note de imagen (más abajo) apunta a esta tool cuando el motor es ciego.
function visionMcpServer(fleetAgent: { id: string; token: string }): Record<string, unknown> {
  const base = (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
  const url = `${base}/api/v2/fleet-vision/${fleetAgent.id}/mcp?token=${encodeURIComponent(fleetAgent.token)}`;
  return {
    vision: { type: "http", url, headers: { Authorization: `Bearer ${fleetAgent.token}` } },
  };
}

// Canal-side vision para motores CIEGOS (text-only): describe una imagen ENTRANTE
// server-side (ya tenemos los bytes) e inyecta el texto al turno — el modelo nunca
// tiene que "acordarse" de llamar see_image para lo que el usuario mandó, y no hay
// URL de por medio (cubre `bytes` inline de GTeams y el path de baileys por igual).
// La tool see_image queda para que el AGENTE verifique sus PROPIOS outputs (PDFs que
// genera, con su URL). Devuelve la descripción + OCR, o null si Gemini falla.
async function describeInboundImage(
  ownerId: string,
  base64: string,
  mediaType: string,
  question?: string
): Promise<string | null> {
  try {
    const { consumeService } = await import("../services/consume");
    const data = new Uint8Array(Buffer.from(base64, "base64"));
    const r = await consumeService<import("../services/providers/describe").DescribeImageOutput>(
      "image.gemini.describe",
      { images: [{ data, mediaType }], question },
      { userId: ownerId }
    );
    return r.data.description || null;
  } catch (e) {
    console.error("describeInboundImage failed:", e);
    return null;
  }
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
  "MODO ADMINISTRACIÓN: el dueño te escribe en privado desde la conversación de administración. Tienes herramientas `mcp__admin__*`:\n" +
  "• `set_agent_prompt({ systemPrompt, append })` — REESCRIBE (pasando el texto completo) o AÑADE (`append: true`) a tus PROPIAS instrucciones base: identidad, políticas, tono, reglas de venta/atención. Es tu \"CLAUDE.md\". Los cambios aplican en tu PRÓXIMO turno (no en el actual). OJO: los DATOS estructurados (catálogo, precios, clientes, inventario) NO van aquí — si tienes tools de base de datos u otra herramienta para eso, edítalos AHÍ (p.ej. `db_exec` sobre tu catálogo); el prompt es solo para instrucciones y conocimiento que no viva ya en una herramienta.\n" +
  "• Números WhatsApp Business (WABA): listar, editar identidad (nombre/instrucciones) y ajustar capacidades por número.\n" +
  "REGLA CRÍTICA anti-invención: NUNCA afirmes que guardaste, agregaste o actualizaste algo (p.ej. \"ya quedó\", \"lo guardé en mi entrenamiento\") a menos que HAYAS llamado la tool correspondiente en ESTE turno y haya devuelto éxito. Si no la llamaste o falló, dilo con claridad en vez de inventar que quedó.";

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
  onChunk?: (s: string) => void,
  onTool?: (name: string) => void
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
        const evt = JSON.parse(json) as { type?: string; value?: string; message?: string; name?: string };
        if (evt.type === "chunk" && typeof evt.value === "string") {
          reply += evt.value;
          onChunk?.(evt.value);
        } else if (evt.type === "tool" && typeof evt.name === "string") {
          onTool?.(evt.name);
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

// ── Warm spare pure decision helpers (unit-tested in test/warmSpare.test.ts) ──
// freeSlotsOf: total READY worker slots across a fleet's VMs — each VM offers
// (maxWorkersPerVm − its current route count). A new conversation needs one free
// slot; if this is below warmSpares, topUpWarmSpares pre-boots more.
export function freeSlotsOf(routeCounts: number[], maxWorkersPerVm: number): number {
  return routeCounts.reduce((n, r) => n + Math.max(0, maxWorkersPerVm - r), 0);
}
// selectHotSpares: up to `warmSpares` ZERO-route VMs to keep RUNNING (instant
// claim). The reaper exempts these from suspend/destroy while the fleet is active,
// so an unclaimed spare never degrades to a ~700ms resume. VMs already hosting a
// conversation are never "hot spares" (they're in use).
export function selectHotSpares(vms: { id: string; routes: number }[], warmSpares: number): string[] {
  const hot: string[] = [];
  for (const vm of vms) {
    if (hot.length >= warmSpares) break;
    if (vm.routes === 0) hot.push(vm.id);
  }
  return hot;
}

// Spawn a fresh VM for the fleetAgent, branded from persona, RAM-gated.

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
  // Modelo del worker — persona.env gana (override por-agente), si no el default
  // de flota. El CLI del worker lo lee de su env (ver FLEET_DEFAULT_MODEL).
  if (!env.ANTHROPIC_MODEL) env.ANTHROPIC_MODEL = FLEET_DEFAULT_MODEL;
  // Effort del worker — mismo patrón: persona.env gana, si no el default de flota.
  // Baja el thinking-antes-del-primer-token (snappy). Ver FLEET_DEFAULT_EFFORT.
  if (!env.FLEET_EFFORT) env.FLEET_EFFORT = FLEET_DEFAULT_EFFORT;
  // Sesión persistente: default ON para claude-worker (UN subproceso claude por
  // conversación → turnos 2..N ~2× más rápidos, validado A/B en prod ~8s→~3.8s). El
  // código vive en claude-worker y en codex-worker (Thread in-process del Codex SDK →
  // misma ganancia). ghosty-gc se hará después. persona.env gana (override/apagar).
  if (
    !env.FLEET_PERSISTENT_SESSION &&
    (fleetAgent.workerTemplate === "claude-worker" || fleetAgent.workerTemplate === "codex-worker")
  ) {
    env.FLEET_PERSISTENT_SESSION = "1";
  }
  // El host escribe el env como EnvironmentFile de systemd (una línea KEY=VALUE) y
  // RECHAZA valores con newline (400 "env value ... contains newline") → el spawn
  // falla y el worker nunca arranca. Un SYSTEM_PROMPT multi-línea (o cualquier valor)
  // rompía TODOS los spawns. Colapsa newlines a espacio — semánticamente inocuo para
  // un prompt, y el único choke point donde pasa cualquier fuente de env.
  for (const k of Object.keys(env)) {
    if (typeof env[k] === "string" && /[\r\n]/.test(env[k])) {
      env[k] = env[k].replace(/[\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
    }
  }
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

// Extensión de archivo desde el MIME (o el nombre original) — para nombrar el archivo
// que se escribe al worker con una extensión que el agente/Read reconozca.
function extFromMime(mimeType: string, name?: string): string {
  const fromName = name?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/webm": "weba",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "text/plain": "txt", "text/markdown": "md", "text/csv": "csv",
    "application/json": "json", "application/zip": "zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mimeType.toLowerCase()] ?? "bin";
}

// Session command — `/clear` (and aliases) resets a group's conversation: drops
// the externalized memory blob, wipes the workspace on a live VM, and rotates the
// sessionUuid so the NEXT message starts a brand-new conversation. Mirrors
// nanoclaw's /clear ("Sesión limpia. 🧹"). The durable FleetAgentMessage audit log is
// intentionally kept (it's not fed back to the worker's memory).
export async function clearGroupSession(ctx: AuthContext, fleetAgent: PoolRow, groupId: string): Promise<string> {
  const route = await db.fleetAgentRoute.findUnique({ where: { fleetAgentId_groupId: { fleetAgentId: fleetAgent.id, groupId } } });
  if (route) {
    pendingCompact.delete(route.sessionUuid);
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
  opts: { skipRateLimit?: boolean; hasMedia?: boolean; skipUserLog?: boolean; onChunk?: (s: string) => void; onTool?: (name: string) => void } = {}
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

  // Full media surface (A2A FileParts): resuelve cada archivo a base64 (bytes inline
  // o fetch de la uri firmada) UNA vez. Audio sin texto → transcribe (canal-agnóstico)
  // y no se escribe a disco; el resto queda pendiente de escribir al worker (Read).
  const inboundFiles: { base64: string; mimeType: string; name?: string }[] = [];
  for (const f of msg.files ?? []) {
    let base64 = f.bytes || null;
    if (!base64 && f.uri) {
      try {
        const r = await fetch(f.uri);
        if (r.ok) base64 = Buffer.from(await r.arrayBuffer()).toString("base64");
      } catch (e) {
        console.error("fleetAgent inbound file fetch failed:", e);
      }
    }
    if (!base64) continue;
    if (f.mimeType.startsWith("audio/") && !msg.text.trim()) {
      const { transcribeAudio } = await import("./fleetVoice");
      const t = await transcribeAudio(fleetAgent.ownerId, Buffer.from(base64, "base64"), f.mimeType).catch(() => null);
      if (t) msg = { ...msg, text: t };
      continue;
    }
    inboundFiles.push({ base64, mimeType: f.mimeType, name: f.name });
  }

  auditLog("route.in", {
    groupId: msg.groupId,
    sender: msg.sender ?? null,
    textLen: msg.text.length,
    // Truthful flag from the edge's extraction; falls back to mediaUrl presence.
    hasMedia: opts.hasMedia ?? (!!msg.mediaUrl || !!msg.image || inboundFiles.length > 0),
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
  // En WABA un CLIENTE podría escribir "/clear" y romper su propia sesión. Gateamos
  // los comandos a admin (el dueño desde el Inbox manda admin:true). Baileys/web sin
  // cambio. No-admin en WABA → cae a turno normal (el agente lo ve como texto).
  const cmdOk = !msg.groupId.startsWith("waba:") || msg.admin === true;
  if (cmdOk && (cmd === "/clear" || cmd === "/nueva" || cmd === "/reset")) {
    return clearGroupSession(ctx, fleetAgent, msg.groupId);
  }
  const bareCompact = cmdOk && cmd === "/compact";

  // skipUserLog: the caller already persisted the user's message(s) (e.g. WABA
  // "Solicitar respuesta" replays messages logged while paused) → don't double-log.
  if (!opts.skipUserLog) {
    await db.fleetAgentMessage.create({
      data: { fleetAgentId: fleetAgent.id, groupId: msg.groupId, role: "user", sender: msg.sender ?? null, senderName: msg.senderName ?? null, text: msg.text },
    });
  }

  let content = bareCompact ? "/compact" : formatContent(msg); // stable UUID → per-conversation .jsonl transcript
  let placed = await pickOrSpawn(ctx, fleetAgent, msg.groupId);
  // Config unit for key + capabilities: the number (WABA) o la conversación misma.
  // Canal WEB (bubbles en landings): los groupId son `web-<uuid>` EFÍMEROS (uno por
  // conversación) → normalizamos a la clave ESTABLE "web" para que TODAS las burbujas
  // compartan UNA config configurable (prompt/tools) — igual que Teams usa "teams".
  // El ruteo de conversación sigue por msg.groupId (route pegajosa); solo la config
  // se resuelve por cfgId. El denikApiKey per-turn (msg.denikApiKey) sigue ganando,
  // así que el scope reseller por-customer no se ve afectado.
  const rawCfgId = msg.configGroupId ?? msg.groupId;
  const cfgId = /^web(-|$)/.test(rawCfgId) ? "web" : rawCfgId;
  // Teams: EasyBits no sabe de la conexión (vive en GTeams). La INFERIMOS del primer
  // turno con cfgId "teams" → estampa connectedAt (idempotente: un solo write) para
  // prender el indicador del canal en /dash/flota. Guarded (.catch): jamás tumba el turno.
  if (cfgId === "teams") {
    const gc = (fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {};
    if (!gc["teams"]?.connectedAt) {
      const next = { ...gc, teams: { ...(gc["teams"] ?? {}), connectedAt: new Date().toISOString() } };
      await db.fleetAgent.update({ where: { id: fleetAgent.id }, data: { groupConfigs: next } }).catch(() => {});
    }
  }

  // ¿El motor VE imágenes nativas? (Claude sí; DeepSeek/GLM/… no). Gobierna cómo se
  // trata TODA imagen entrante (msg.image de baileys + FileParts de GTeams, abajo).
  const engineSees = engineHasVision(
    fleetAgent.workerTemplate,
    (fleetAgent.persona as { env?: Record<string, string> } | null)?.env
  );

  // Imagen entrante (baileys/WhatsApp) — la ruta depende de si el motor ve:
  //  · multimodal (Claude): dropea la imagen a disco y dile "ábrela con Read".
  //  · text-only: Read NO ve imágenes → si le decimos "ábrela con Read" el modelo
  //    CONFABULA su contenido. Describe la imagen SERVER-SIDE (Gemini + OCR) e inyecta
  //    el texto → ve de verdad, sin depender de una tool ni de una URL.
  // El write a disco (multimodal) ocurre DENTRO del loop para cubrir self-heal.
  let imgPath: string | null = null;
  if (msg.image && !bareCompact) {
    if (engineSees) {
      imgPath = `/tmp/wa-img-${placed.sessionUuid}-${Date.now()}.${msg.image.ext}`;
      const urlNote = msg.image.url ? ` (si necesitas editarla/reusarla con tus tools de imagen, su URL es ${msg.image.url})` : "";
      content = `[El usuario envió una IMAGEN. Está guardada en ${imgPath} — ÁBRELA con la tool Read para verla antes de responder.${urlNote}]\n${content}`;
    } else {
      const mediaType = `image/${msg.image.ext === "jpg" ? "jpeg" : msg.image.ext}`;
      const desc = await describeInboundImage(fleetAgent.ownerId, msg.image.base64, mediaType, msg.text.trim() || undefined);
      content = desc
        ? `[El usuario envió una IMAGEN. Esto es lo que muestra (visión Gemini + OCR):\n${desc}\n\nResponde con base en esto — NO inventes nada más. Si generas un PDF/PNG, usa la tool see_image sobre su URL para VERIFICAR el resultado.]\n${content}`
        : `[El usuario envió una IMAGEN pero no pude analizarla. Pídele que la reenvíe — NO inventes qué muestra.]\n${content}`;
    }
  }

  // Archivos A2A (FileParts) → asigna un path por archivo y anótalos en el prompt; se
  // escriben al worker DENTRO del loop (self-heal). Cubre imagen/video/pdf/doc/desconocido.
  const filePaths: { path: string; base64: string }[] = [];
  if (inboundFiles.length && !bareCompact) {
    const notes: string[] = [];
    for (let i = 0; i < inboundFiles.length; i++) {
      const f = inboundFiles[i];
      const isImage = f.mimeType.startsWith("image/");
      const named = f.name ? `, "${f.name}"` : "";
      // Motor ciego + IMAGEN (así llega el adjunto de GTeams): descríbela server-side
      // e inyecta el texto — NO la escribas a disco (Read no la vería) ni dejes que el
      // modelo la adivine. Los archivos NO-imagen (pdf/doc/txt) sí van a disco + Read.
      if (isImage && !engineSees) {
        const desc = await describeInboundImage(fleetAgent.ownerId, f.base64, f.mimeType, msg.text.trim() || undefined);
        notes.push(
          desc
            ? `[El usuario envió una IMAGEN${named}. Esto es lo que muestra (visión Gemini + OCR):\n${desc}\n\nResponde con base en esto — NO inventes nada más.]`
            : `[El usuario envió una IMAGEN${named} pero no pude analizarla. Pídele que la reenvíe — NO inventes qué muestra.]`
        );
        continue;
      }
      const path = `/tmp/gt-file-${placed.sessionUuid}-${i}-${Date.now()}.${extFromMime(f.mimeType, f.name)}`;
      filePaths.push({ path, base64: f.base64 });
      const kind = isImage ? "IMAGEN" : "ARCHIVO";
      notes.push(`[El usuario envió un ${kind} (${f.mimeType}${named}) guardado en ${path} — ÁBRELO con la tool Read.]`);
    }
    content = `${notes.join("\n")}\n${content}`;
  }

  // Auto-compact: a prior turn flagged this session as over-threshold. Run a
  // bare "/compact" turn FIRST (SDK-native, in-place, same sticky sessionUuid),
  // then proceed with the user's message. Best-effort — a failed compact must
  // NOT drop the user's turn (degrade, don't break). Skip when the user is
  // already sending /compact (bareCompact handles it) or clearing the session.
  if (pendingCompact.has(placed.sessionUuid) && !bareCompact) {
    pendingCompact.delete(placed.sessionUuid);
    try {
      busyVms.add(placed.vm.id);
      const w = placed.vm;
      const cstream = await openAgentChunkStream(
        {
          agentId: w.id,
          ownerId: w.ownerId,
          sandboxId: w.sandboxId,
          protocol: w.protocol ?? "sse",
          port: w.port ?? 3000,
          messagePath: w.messagePath ?? "/message",
          acpSessionId: w.acpSessionId,
          acpTransportSessionId: w.acpTransportSessionId,
          embedToken: w.embedToken,
          template: w.template,
        },
        { content: "/compact", sessionId: placed.sessionUuid }
      );
      await collectStream(cstream);
      auditLog("compact.ok", { groupId: msg.groupId, sessionUuid: placed.sessionUuid });
    } catch (e) {
      console.error(`fleetAgent auto-compact ${placed.sessionUuid} failed:`, e);
    } finally {
      busyVms.delete(placed.vm.id);
    }
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
      // Archivos A2A (imagen/video/pdf/doc/desconocido) → al worker (re-escritos en el
      // self-heal), para que Read los encuentre antes de abrir el turno.
      for (const f of filePaths) {
        await writeFile(ctx, worker.sandboxId, { path: f.path, content: f.base64, encoding: "base64" }).catch(
          (e) => console.error(`fleetAgent file write ${f.path} failed:`, e)
        );
      }
      // Per-channel config: system-prompt append (layer 3) + code-mode capabilities
      // (elevenlabs & co.) → their skillDocs go into the prompt; their env is ready
      // for the worker via turnEnv (consumed once the worker template supports it).
      const groupCfg = ((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {})[cfgId] ?? {};
      const codeCaps = await resolveGroupCodeCaps(fleetAgent, cfgId, fleetAgent.ownerId);
      // Skills encendidos: name/description al prompt (progressive disclosure) + sus
      // files al manifiesto (para que el agente lea el SKILL.md y baje el script).
      const skillsRes = await resolveSkillsPrompt(fleetAgent);
      const assetManifest = await resolveGroupAssetManifest(fleetAgent, cfgId, skillsRes.fileIds);
      const dbScope = resolveGroupDbScope(fleetAgent, cfgId);
      const toolsManifest = resolveGroupToolsManifest(fleetAgent, cfgId);
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
          turnEnv: codeCaps?.env,
          // Per-grupo: la dnk_pub_ del org dueño de este grupo. El body gana
          // (canales web la mandan por turno); cae a fleetAgent.groupKeys[cfgId]
          // (registrado al crear el grupo, ruta WhatsApp). cfgId = configGroupId
          // (WABA: el número) o groupId (Baileys/web: la conversación misma).
          denikApiKey:
            msg.denikApiKey ??
            (fleetAgent.groupKeys as Record<string, string> | null)?.[cfgId],
          // Capa 3 (per-org) PRECEDIDA por el guardrail de plataforma fresco —
          // así el guardrail de voz llega a todos los agentes sin rebuild/migración.
          appendSystemPrompt: [
            PLATFORM_VOICE_GUARDRAIL,
            // Ruteo de documentos: fuerza el motor correcto (docs-router/oficio/xlsx/
            // pptx/structured_doc) y prohíbe create_document+set_page_html a mano.
            DOC_ROUTING_GUARDRAIL,
            // Identidad del modelo: que el agente sepa que corre Sonnet 5 y sus
            // características. Solo si el modelo resuelto es el default (un agente
            // que pinea otro modelo vía persona.env no recibe el claim).
            (((fleetAgent.persona as Persona | null)?.env?.ANTHROPIC_MODEL ??
              FLEET_DEFAULT_MODEL) === "claude-sonnet-5")
              ? MODEL_IDENTITY_SONNET5
              : null,
            // Apariencia oficial de Ghosty (morado + lentes) SOLO si el agente es
            // Ghosty → corrige el auto-retrato genérico sin tocar personas custom.
            (fleetAgent.assistantName === "Ghosty" ||
              (fleetAgent.persona as Persona | null)?.env?.ASSISTANT_NAME === "Ghosty")
              ? GHOSTY_APPEARANCE_GUARDRAIL
              : null,
            // Búsqueda web: desbloquea el rechazo a preguntas por datos externos
            // (precios/tiendas/info pública) — el worker trae WebSearch/WebFetch. Solo
            // Ghosty (como la apariencia), para no alterar personas custom de tenants.
            (fleetAgent.assistantName === "Ghosty" ||
              (fleetAgent.persona as Persona | null)?.env?.ASSISTANT_NAME === "Ghosty")
              ? WEB_RESEARCH_GUARDRAIL
              : null,
            // Identidad de canal (per-canal, UN solo guardrail de entrega por turno).
            // Reemplaza el framing WhatsApp que antes vivía HORNEADO en la persona base
            // (removido) y se filtraba a Teams → "WhatsApp no está conectado". WABA y
            // web/Teams entregan por URL (la plataforma adjunta/previsualiza); baileys
            // (groupId = JID de WhatsApp) entrega por adjunto con `wa send_message`.
            cfgId.startsWith("waba:")
              ? WABA_DELIVERY_GUARDRAIL
              : /@(g\.us|s\.whatsapp\.net)$/.test(msg.groupId)
                ? BAILEYS_DELIVERY_GUARDRAIL
                : WEB_DELIVERY_GUARDRAIL,
            // Code Mode: si este fleetAgent corre con un perfil (la superficie lean
            // siempre empieza con `scripting`, seguido de los buckets del perfil).
            (fleetAgent.persona as Persona | null)?.env?.EASYBITS_TOOL_GROUP?.startsWith("scripting")
              ? CODE_MODE_GUIDANCE
              : null,
            msg.admin ? ADMIN_NOTE : null,
            // Per-canal: system prompt del dueño (editable por número/grupo) + docs
            // de las capacidades code-mode habilitadas (cómo pegarle a su API).
            groupCfg.systemPrompt || null,
            ...(codeCaps?.skillDocs ?? []),
            // Skills del agente (name+description; el SKILL.md se lee on-demand).
            skillsRes.prompt,
            assetManifest,
            dbScope,
            toolsManifest,
            msg.appendSystemPrompt,
          ]
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
            ...artifactMcpServer(fleetAgent),
            // vision = SIEMPRE inyectado (como render) → un motor ciego puede VER una
            // imagen con see_image en vez de confabular. El multimodal no la llama.
            ...visionMcpServer(fleetAgent),
            // admin = SOLO en turnos admin (dueño en su conversación admin de WABA).
            ...(msg.admin ? adminMcpServer(fleetAgent) : {}),
          },
          // Per-grupo: builtins apagados (ej. ["easybits"]) → el worker los quita
          // del set MCP de ese turno (forzar uso de cajas de la flota).
          disabledBuiltins: resolveDisabledBuiltins(fleetAgent, cfgId),
          // Per-NÚMERO/grupo: el tool group de EasyBits (?tools=) que el worker
          // aplica per-turno al server easybits, sobreescribiendo el default del
          // agente (persona.env.EASYBITS_TOOL_GROUP). Vacío → el worker usa su env.
          toolGroup: resolveToolGroup(fleetAgent, cfgId),
        }
      );
      reply = await collectStream(stream, opts.onChunk, opts.onTool);
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
  // Auto-compact trigger (off the critical path): measure the transcript AFTER
  // replying; if it crosses the threshold, flag the session so the NEXT turn
  // injects a "/compact". Fire-and-forget — never delays or fails this reply.
  // Skip for a bareCompact turn (it just shrank the transcript).
  if (!bareCompact) {
    void measureJsonlBytes(ctx, placed.vm, placed.sessionUuid)
      .then((bytes) => {
        if (bytes > COMPACT_THRESHOLD_BYTES) {
          pendingCompact.add(placed.sessionUuid);
          auditLog("compact.flag", { sessionUuid: placed.sessionUuid, bytes });
        }
      })
      .catch(() => {});
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

    // Warm pool: keep up to `warmSpares` zero-route running VMs HOT — never
    // suspend or destroy them while the fleet is active — so a BRAND-NEW
    // conversation claims them INSTANTLY (not ~700ms resume, not ~14s cold). This
    // is the lowest-latency choice, traded for idle RAM. A DORMANT fleet (no route
    // touched within destroyIdleMin) skips this → its spares get reaped normally
    // and topUpWarmSpares won't recreate them, so RAM is only held while in use.
    const hotSpares = new Set<string>();
    if (fleetAgent.warmSpares > 0) {
      const activeCutoff = new Date(now - fleetAgent.destroyIdleMin * 60_000);
      const active = await db.fleetAgentRoute.count({
        where: { fleetAgentId: fleetAgent.id, lastMessageAt: { gte: activeCutoff } },
      });
      if (active) {
        const running = await db.agent.findMany({
          where: { fleetAgentId: fleetAgent.id, status: "running" },
          select: { id: true },
        });
        const withRoutes = await Promise.all(
          running.map(async (vm) => ({ id: vm.id, routes: await workersOnVm(vm.id) }))
        );
        for (const id of selectHotSpares(withRoutes, fleetAgent.warmSpares)) hotSpares.add(id);
      }
    }

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
      if (hotSpares.has(w.id)) continue; // warm pool: keep the hot spare alive
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
      if (hotSpares.has(w.id)) continue; // warm pool: keep the hot spare running (instant claim)
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

// ── topUpWarmSpares ──────────────────────────────────────────────────────────
// Warm spare pool for the fleet. Keeps `fleetAgent.warmSpares` FREE worker slots
// pre-booted so a BRAND-NEW conversation claims a ready VM (instant, or ~700ms if
// the spare got parked by the reaper) instead of cold-booting ~14s. A "spare" is
// just an extra Agent row with the fleet's OAuth baked and 0 routes — reserveVm's
// existing candidate loop (running/building/suspended VM with a free slot) already
// claims it, so there is NO new claim path here; we only pre-BOOT the capacity.
//
// Runs on the 60s reaper heartbeat AFTER reapIdleFleetAgents (reap first, then
// refill). Only tops up fleets with recent activity (a route touched within
// destroyIdleMin) so a dormant agent holds no idle RAM. Budget-gated: spawnVm
// throws FleetAgentAtCapacity when the owner is at plan budget → we skip (real
// demand still falls back to the queue/eviction path). One spawn per fleet per
// tick to avoid bursts; the pool fills gradually (cheap with FC_ROOTFS_DM).
export async function topUpWarmSpares(): Promise<{ checked: number; spawned: number }> {
  let spawned = 0;
  const fleets = await db.fleetAgent.findMany({ where: { warmSpares: { gt: 0 } } });
  for (const fleetAgent of fleets) {
    try {
      // Only pre-warm fleets that are actually in use (a conversation touched
      // within the destroy window). No point holding RAM for a dormant agent.
      const activeCutoff = new Date(Date.now() - fleetAgent.destroyIdleMin * 60_000);
      const active = await db.fleetAgentRoute.count({
        where: { fleetAgentId: fleetAgent.id, lastMessageAt: { gte: activeCutoff } },
      });
      if (!active) continue;

      // Count ready free slots across the fleet's non-dead VMs. A suspended VM
      // still counts — reserveVm claims it and ensureRunning resumes it ~700ms.
      const vms = await db.agent.findMany({
        where: { fleetAgentId: fleetAgent.id, status: { in: ["running", "building", "suspended"] } },
        select: { id: true },
      });
      const routeCounts = await Promise.all(vms.map((vm) => workersOnVm(vm.id)));
      const freeSlots = freeSlotsOf(routeCounts, fleetAgent.maxWorkersPerVm);
      if (freeSlots >= fleetAgent.warmSpares) continue;

      // Not enough headroom → pre-boot ONE spare VM this tick (budget-gated).
      const ctx = await ctxForOwner(fleetAgent.ownerId).catch(() => null);
      if (!ctx) continue;
      await spawnVm(ctx, fleetAgent);
      spawned++;
      auditLog("warm-spare", { fleetAgent: fleetAgent.id, freeSlots, target: fleetAgent.warmSpares });
    } catch (e) {
      if (e instanceof FleetAgentAtCapacity) continue; // at budget → queue/eviction covers demand
      console.error(`warm-spare top-up for ${fleetAgent.id} failed:`, (e as Error).message);
    }
  }
  return { checked: fleets.length, spawned };
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
// BASE / guardrails de plataforma (brevedad, uso de tools, honestidad — AGNÓSTICO
// de canal: la entrega de archivos la dicta el guardrail de canal per-turno, no la
// persona). NO es la personalidad final: cuando llegue la customización del
// dueño (agenda #3, form de agente), su texto debe COMPONERSE ENCIMA de esto
// (append), nunca reemplazar estos guardrails — si no, se pierden el "sin
// markdown" y la brevedad. Ver [[project_pool_production_agenda]].
const GHOSTY_SYSTEM = [
  "Eres Ghosty, un asistente de EasyBits. Responde SIEMPRE en español, con tono cálido y directo.",
  "SÉ BREVE: entrega el resultado, no el proceso. Nada de relleno ni cierres tipo '¿algo más?'.",
  "Texto plano; evita Markdown pesado (títulos con #, tablas, bloques de código) salvo que de verdad ayude.",
  "Tienes las herramientas de EasyBits vía MCP (`easybits`): documentos, imágenes, archivos, sitios — úsalas cuando ayuden. La forma de ENTREGAR archivos depende del canal (te la indica el guardrail de canal de cada turno); no asumas WhatsApp.",
  "Si algo está fuera de tu alcance, dilo con honestidad.",
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

// Ruteo de DOCUMENTOS: cierra el hueco de que el agente vaya directo a
// create_document+set_page_html (se cuelga, pagina mal, tabla improvisada) sin ver la
// prohibición que vive DENTRO del skill. Inyectado FRESCO cada turno → aplica a todos
// los agentes. La suite de doc-gen (oficio→docx, xlsx-gen, pptx-gen, doc-remix,
// readers) vive baked en el worker (Bash local) + el motor de PDF con marca es
// structured_doc. El skill `docs-router` tiene el árbol completo.
const DOC_ROUTING_GUARDRAIL = [
  "DOCUMENTOS: para generar CUALQUIER documento con formato (oficio, carta, circular, memo, contrato, NDA, dictamen, cotización, factura, reporte, informe, hoja de cálculo, presentación) usa PRIMERO el skill `docs-router` (te dice el motor correcto).",
  "Reglas: prosa/oficio/carta/contrato/dictamen → skill `oficio` (python3 oficio-docx.py → .docx editable). Tabla/hoja de cálculo → skill `xlsx-gen` (.xlsx). Slides/presentación → skill `pptx-gen` (.pptx). PDF con marca (factura/cotización/reporte/informe) → tool `structured_doc` (@react-pdf, template+data). Clonar/versión de un PDF → skill `doc-remix`.",
  "PROHIBIDO armar documentos con formato a mano con create_document + set_page_html: ese HTML gigante se CUELGA y pagina mal (2 hojas para media carilla). Ese path es solo para HTML libre corto sin formato.",
  "Entrega: genera en /tmp, sube con upload_file (te da file.url) y comparte la URL en tu respuesta.",
].join(" ");

// Estilo de respuesta: la plataforma YA muestra un checklist bonito (✅ lista) con cada
// paso/tool. El agente NO debe RE-narrar esos pasos en un muro de texto corrido y
// amontonado ("ahora subo… subida exitosa… ahora lo envío…"). Pero SÍ da un resultado
// legible y CON FORMATO. Inyectado fresco por turno.
const REPLY_STYLE_GUARDRAIL = [
  "FORMATO DE TU RESPUESTA: el sistema ya muestra un checklist con cada paso que diste (✅ por tool) — NO repitas ese relato paso a paso ('ahora subo…', 'subida exitosa', 'ahora lo envío…') en un párrafo corrido.",
  "Da el RESULTADO con buen formato y aire: frases cortas, saltos de línea o viñetas entre ideas, NUNCA un bloque de texto amontonado. Incluye la URL del archivo si generaste uno. Piensa en legibilidad, no en narrar el proceso.",
].join(" ");

// APARIENCIA de Ghosty: la persona dice QUIÉN es pero nunca cómo SE VE → al
// pedirle que se auto-ilustre inventaba un fantasma blanco genérico en vez del
// Ghosty de la marca. Inyectado FRESCO por turno (como el guardrail de voz) y
// SOLO cuando el agente es Ghosty, así alcanza a los agentes ya creados sin
// rebuild y no contamina personas custom de otros tenants.
const GHOSTY_REFERENCE_IMAGE_URL = "https://www.easybits.cloud/ghosty.png";
const GHOSTY_APPEARANCE_GUARDRAIL = [
  "TU IMAGEN: cuando te pidan ilustrarte, dibujarte, generar tu avatar o 'cómo eres', NO inventes un fantasma blanco genérico.",
  `Tu retrato oficial está en ${GHOSTY_REFERENCE_IMAGE_URL} — pásalo SIEMPRE como referencia a create_or_edit_image en imageUrls:["${GHOSTY_REFERENCE_IMAGE_URL}"] para que el resultado sea fiel a ti.`,
  "Para referencia, tu apariencia es: fantasma de cuerpo redondeado color MORADO/lavanda con la clásica silueta ondulada abajo; ojos grandes ovalados negros; lentes redondos de armazón delgado metálico sobre los ojos; rubor rosa sutil en las mejillas; estilo plano y amigable.",
  "Incluye estos rasgos (morado + lentes redondos) y la imagen de referencia en CUALQUIER generación donde aparezcas tú.",
].join(" ");

// Búsqueda web: la persona horneada enmarca a Ghosty como asistente SOLO de archivos/
// docs de EasyBits, y la línea "si te piden algo fuera de tu alcance, dilo con
// honestidad" lo empuja a DECLINAR preguntas por datos externos (precios, dónde
// comprar algo, info pública) — aunque el worker SÍ trae WebSearch/WebFetch nativos y
// funcionan (verificado en vivo: devuelve precios/tiendas reales cuando se le pide
// explícito). Inyectado FRESCO por turno (como voz/apariencia) SOLO para Ghosty, así
// alcanza a los agentes ya creados sin rebuild y no toca personas custom de otros
// tenants. Desbloquea el rechazo sin cambiar la persona base.
const WEB_RESEARCH_GUARDRAIL = [
  "BÚSQUEDA WEB: si te preguntan por datos EXTERNOS a EasyBits (precios, dónde comprar algo, disponibilidad en tiendas, info pública, noticias), SÍ puedes ayudarte de la web con tus herramientas WebSearch/WebFetch — ÚSALAS en vez de declinar.",
  "Da el dato concreto y, si aplica, la fuente. NUNCA digas que 'no manejas' ese tema como excusa para no buscar; solo aclara que no vendes ni gestionas productos físicos si te lo preguntan directamente.",
].join(" ");

// WABA (WhatsApp Business): este canal NO tiene el server `wa` (Baileys) ni un
// socket. Inyectado per-turno SOLO para WABA para corregir la persona horneada que
// dice "usa wa send_message" → de ahí la alucinación "socket caído". En WABA los
// archivos se entregan incluyendo su URL pública en el TEXTO de la respuesta; la
// plataforma la descarga y adjunta sola.
const WABA_DELIVERY_GUARDRAIL = [
  "CANAL WhatsApp Business (WABA): NO tienes el server MCP `wa` ni un socket. NUNCA intentes `wa send_message`/`wa send_poll`/`wa react_message` ni digas que 'el socket está caído' — eso aquí no aplica.",
  "Para ENVIAR un archivo (imagen, PDF, etc.): genera/súbelo a EasyBits e incluye su URL pública directamente en tu respuesta de texto. La plataforma la descarga y la adjunta al chat automáticamente — no necesitas ninguna herramienta de envío.",
].join(" ");

// baileys (WhatsApp personal/grupo): este canal SÍ tiene el server `wa` (socket
// Baileys). Reemplaza la instrucción de entrega que ANTES vivía horneada en la persona
// base (removida para que no se filtrara a Teams/web y provocara la alucinación "WhatsApp
// no está conectado"). Inyectado per-turno SOLO cuando el groupId es un JID de WhatsApp.
const BAILEYS_DELIVERY_GUARDRAIL =
  "CANAL WhatsApp: tienes el server MCP `wa` (socket). Para ENVIAR un archivo (imagen, PDF, etc.) mándalo como ADJUNTO con `wa send_message`, no solo pegando el link en el texto.";

// Canal WEB (Ghosty Teams room o widget web): NO es WhatsApp y NO tiene socket `wa`.
// Sin esto el agente cae al modelo mental WhatsApp de la persona horneada y responde
// "WhatsApp no está conectado" en un room de Teams. Los archivos se entregan por su URL
// pública en el texto → la plataforma los muestra como ARTEFACTO (con vista previa) en el
// room. Inyectado per-turno para todo canal que NO sea WhatsApp (baileys) ni WABA.
const WEB_DELIVERY_GUARDRAIL = [
  "CANAL WEB (Ghosty Teams / widget): NO estás en WhatsApp. NUNCA digas que 'WhatsApp no está conectado' ni intentes `wa send_message` — ese canal no aplica aquí.",
  "Para ENTREGAR un archivo (imagen, PDF, HTML, etc.): genera/súbelo a EasyBits e incluye su URL pública directamente en tu respuesta de texto. La plataforma la muestra como artefacto con vista previa — no necesitas ninguna herramienta de envío.",
].join(" ");

// Code Mode: guía inyectada SOLO cuando el fleetAgent corre con la superficie MCP
// lean (persona.env.EASYBITS_TOOL_GROUP="scripting"). El tools/list trae apenas
// ~5 tools (file IO + discover_tools/run_tool) en vez de ~140 → el agente alcanza
// el resto escribiendo un script. Ahorra el impuesto fijo de contexto (DeepSeek no
// tolera 140 schemas). Patrón Anthropic "Code execution with MCP" / CF "Code Mode".
const CODE_MODE_GUIDANCE = [
  "MODO SCRIPTING: tienes apenas unas pocas tools cargadas (IO de archivos + discover_tools/run_tool). Para cualquier OTRA operación NO esperes una tool dedicada — descúbrela y ejecútala.",
  "Para encadenar 2+ operaciones, ESCRIBE UN SCRIPT con tu Bash: usa la REST API v2 de EasyBits en $EASYBITS_BASE_URL con `Authorization: Bearer $EASYBITS_API_KEY` (ambos están en tu entorno). Procesa los resultados intermedios DENTRO del script y solo imprime/devuelve lo que necesitas reportar — los pasos intermedios NO deben volver al chat.",
  "Para descubrir qué endpoint/tool usar, llama discover_tools(query) (busca en las ~140 tools por nombre/descripción) y run_tool(name, params) para ejecutar cualquiera sin reconectar. Para 1 sola operación simple, run_tool directo está bien; no armes un script para algo trivial.",
].join(" ");

// Create a fleetAgent for an owner. token is the bearer the Baileys surface presents.
export async function createFleetAgent(
  ctx: AuthContext,
  opts: {
    name?: string;
    systemPrompt?: string; // atajo greenfield (Formmy): → persona.env.SYSTEM_PROMPT sin armar persona
    model?: string; // atajo greenfield: → persona.env[modelEnv] resuelto por el motor
    engine?: string; // atajo alto nivel (registro FLEET_ENGINES): "deepseek"/"codex"/… → template+env+defaultModel
    workerTemplate?: string;
    persona?: Persona;
    oauthSecretName?: string;
    llm?: string; // ghosty-gc: "deepseek" (BYOK) | "easybits" (medido) → GHOSTY_LLM
    env?: Record<string, string>; // env extra del motor (registro FLEET_ENGINES) → persona.env
    maxWorkersPerVm?: number;
    vmMemMb?: number;
    maxVms?: number;
    idleSuspendMin?: number;
    destroyIdleMin?: number;
  } = {}
) {
  // Default tool profile for NEW agents: "Público" (creativo, sin admin). Vive en
  // persona.env.EASYBITS_TOOL_GROUP (= "scripting,imagenes,…"), que el worker lee
  // al spawn → tools/list lean + run_tool acotado al perfil. El env explícito de
  // la persona gana (power users). Agentes EXISTENTES no se tocan (sin este env =
  // catálogo completo, intacto).
  // engine (registro FLEET_ENGINES) = atajo de alto nivel: "deepseek"/"codex"/… →
  // deriva template + env (GHOSTY_LLM/…) + defaultModel, sin que el caller conozca la
  // plomería. Formmy manda `engine` desde su selector de motor. `workerTemplate`/`env`/
  // `llm` explícitos siguen ganando (power users).
  const engineSpec = opts.engine ? getEngine(opts.engine) : undefined;
  if (opts.engine && !engineSpec) throw new Error(`engine desconocido: ${opts.engine}`);
  const workerTemplate = opts.workerTemplate ?? engineSpec?.template ?? "claude-worker";

  const basePersona = opts.persona ?? GHOSTY_PERSONA;
  const persona: Persona = {
    ...basePersona,
    env: {
      EASYBITS_TOOL_GROUP: profileToToolsParam(DEFAULT_PROFILE),
      // Env del motor resuelto por `engine` (p.ej. { GHOSTY_LLM: "deepseek" }). Menor
      // prioridad que `llm`/`env` explícitos.
      ...(engineSpec?.env ?? {}),
      // Motor LLM elegido en el form (ghosty-gc): "easybits" (medido) omite la
      // inyección de DEEPSEEK_API_KEY en createAgent → ghosty-gc-start cae al proxy
      // medido; "deepseek" (default) la inyecta → off-meter. Ver createAgent ghosty-gc.
      ...(opts.llm ? { GHOSTY_LLM: opts.llm } : {}),
      // Env del motor (registro FLEET_ENGINES): p.ej. { GHOSTY_LLM: "deepseek" }.
      // Generaliza `llm`; el form nuevo lo pasa por aquí. persona.env sigue ganando.
      ...(opts.env ?? {}),
      ...(basePersona.env ?? {}),
    },
  };
  // Atajos greenfield (Formmy crea+configura en un shot vía SDK). Se aplican DESPUÉS
  // del merge para GANARLE al spread de basePersona.env (que trae ASSISTANT_NAME
  // "Ghosty" y de otro modo se impone). Solo si el caller NO pasó una persona custom.
  if (!opts.persona) {
    if (opts.name) persona.env!.ASSISTANT_NAME = opts.name;
    if (opts.systemPrompt) persona.env!.SYSTEM_PROMPT = opts.systemPrompt.slice(0, 120000);
    // Modelo: explícito (opts.model) o, si se eligió engine, su defaultModel. Se escribe
    // en persona.env[modelEnv] del motor resuelto (engineSpec gana; si no, se infiere).
    const eng = engineSpec ?? getEngineForAgent(workerTemplate, persona.env);
    const chosenModel = opts.model ?? (engineSpec ? engineSpec.defaultModel : undefined);
    if (eng?.modelEnv && chosenModel) persona.env![eng.modelEnv] = chosenModel;
  }
  return db.fleetAgent.create({
    data: {
      ownerId: ctx.user.id,
      name: opts.name,
      token: "pool_" + randomBytes(24).toString("hex"),
      workerTemplate,
      persona,
      // Deriva la identidad de la persona (ASSISTANT_NAME > persona.name). El
      // default (GHOSTY_PERSONA) trae ASSISTANT_NAME="Ghosty" → sigue siendo
      // "Ghosty"; los agentes creados con persona custom (p.ej. desde Formmy)
      // aparecen con su nombre real en la flota en vez de todos como "Ghosty".
      assistantName: persona.env?.ASSISTANT_NAME ?? opts.name ?? basePersona.name ?? "Ghosty",
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
