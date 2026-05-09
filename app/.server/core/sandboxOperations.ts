import { randomBytes } from "node:crypto";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";

const HOST_URL = process.env.SANDBOX_HOST_URL || "";
const HOST_TOKEN = process.env.SANDBOX_HOST_TOKEN || "";
const DEFAULT_TIMEOUT_S = 300;
const MAX_TIMEOUT_S = 3600;

export type SandboxTemplate =
  | "ubuntu"
  | "python"
  | "node"
  | "node-agent"
  | "bun"
  | "claude-code"
  | "goose"
  | "nanoclaw"
  | "ghosty"
  | "openclaw"
  | "chat-openai"
  | "chat-anthropic";

export interface AgentSpec {
  port?: number;
  protocol?: "http" | "sse" | "ws" | "cli-stdin" | "acp";
  health_path?: string;
  health_command?: string;
  unit?: string;
  env_file?: string;
  message_path?: string;
}

export interface EnvSpec {
  name: string;
  label?: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
}

export interface ConnectionMode {
  id: string;
  label: string;
}

export interface TemplateInfo {
  name: string;
  display?: string;
  description?: string;
  tier?: "chat-embed" | "coding-harness" | "autonomous" | "custom" | "base";
  image: string;
  memoryMb: number;
  vcpus: number;
  agent?: AgentSpec;
  requiredEnv?: EnvSpec[];
  connectionModes?: ConnectionMode[];
}

export interface SandboxRecord {
  sandboxId: string;
  template: SandboxTemplate;
  status: "starting" | "running" | "stopped" | "error";
  createdAt: string;
  expiresAt: string;
  ownerId: string;
  metadata?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  modifiedAt: string;
}

function ensureConfigured(): void {
  if (!HOST_URL || !HOST_TOKEN) {
    throw new Error(
      "Sandbox host not configured. Set SANDBOX_HOST_URL and SANDBOX_HOST_TOKEN env vars."
    );
  }
}

// openAgentMessageStream: open a streaming connection to the runtime via
// the sandbox-host proxy. Returns the raw ReadableStream — caller decides
// how to parse (chat-runtime simple SSE vs Goose ACP JSON-RPC).
//
// Two modes via overloads:
//   - Standard {content, sessionId} body → chat-runtime path "/message"
//   - Override with rawBody + path + headers → Goose "/acp" JSON-RPC, etc.
export interface AgentMessageStream {
  stream: ReadableStream<Uint8Array>;
  headers: Headers;
}

export async function openAgentMessageStream(
  sandboxId: string,
  ownerId: string,
  body: {
    content?: string;
    sessionId?: string;
    port?: number;
    path?: string;
    rawBody?: unknown;
    headers?: Record<string, string>;
    method?: string;
  }
): Promise<AgentMessageStream> {
  ensureConfigured();
  const url = `${HOST_URL.replace(/\/$/, "")}/v1/sandbox/${sandboxId}/agent/message`;
  const payload: Record<string, unknown> = { port: body.port };
  if (body.path) payload.path = body.path;
  if (body.method) payload.method = body.method;
  if (body.headers) payload.headers = body.headers;
  if (body.rawBody !== undefined) {
    payload.rawBody = body.rawBody;
  } else {
    payload.content = body.content;
    payload.sessionId = body.sessionId ?? "default";
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HOST_TOKEN}`,
      "Content-Type": "application/json",
      "X-Easybits-Owner": ownerId,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `sandbox host POST agent/message → ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return { stream: res.body, headers: res.headers };
}

// ─────────────── ACP (Agent Client Protocol) helpers ───────────────
//
// Goose serve exposes JSON-RPC 2.0 over SSE on /acp. These helpers do the
// minimal wire-protocol work we need: initialize handshake, session/new,
// session/prompt, and a TransformStream that converts ACP notifications
// to the simple {type:"chunk"|"done"|"error"} SSE events the embed widget
// already consumes for chat-runtime.

const ACP_HEADERS = { Accept: "application/json, text/event-stream" };

function parseSSEDataLines(chunk: string): unknown[] {
  // Returns array of parsed JSON values from "data: ..." lines in chunk.
  const out: unknown[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        out.push(JSON.parse(line.slice(6)));
      } catch {
        // ignore non-JSON
      }
    }
  }
  return out;
}

// Reads the response from an ACP JSON-RPC POST and returns the FIRST
// `result` payload matching `id`. Used for synchronous handshake calls
// (initialize, session/new) where we don't care about streaming.
async function readAcpRpcResult(
  stream: ReadableStream<Uint8Array>,
  id: number
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      for (const evt of parseSSEDataLines(event) as Array<{
        id?: number;
        result?: unknown;
        error?: { code: number; message: string };
      }>) {
        if (evt.id === id && (evt.result !== undefined || evt.error !== undefined)) {
          await reader.cancel();
          return { result: evt.result, error: evt.error };
        }
      }
    }
  }
  return { error: { code: -1, message: "stream closed without matching result" } };
}

// runAcpHandshake: initialize + session/new. Returns both:
//   - acpTransportSessionId: header from initialize, must be sent on every
//     subsequent ACP call (Goose serve enforces this).
//   - acpSessionId: returned from session/new, identifies the agent session.
// Called eager during startAgent so the first user message has zero
// handshake overhead.
async function runAcpHandshake(
  sandboxId: string,
  ownerId: string,
  port: number,
  messagePath: string
): Promise<{ acpTransportSessionId: string; acpSessionId: string }> {
  // 1. initialize
  const init = await openAgentMessageStream(sandboxId, ownerId, {
    port,
    path: messagePath,
    headers: ACP_HEADERS,
    rawBody: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} },
    },
  });
  const acpTransportSessionId = init.headers.get("acp-session-id") ?? "";
  if (!acpTransportSessionId) {
    throw new Error("ACP initialize: server did not return Acp-Session-Id header");
  }
  const initRes = await readAcpRpcResult(init.stream, 1);
  if (initRes.error) {
    throw new Error(`ACP initialize failed: ${initRes.error.message}`);
  }

  // 2. session/new — must carry Acp-Session-Id from initialize.
  const sess = await openAgentMessageStream(sandboxId, ownerId, {
    port,
    path: messagePath,
    headers: { ...ACP_HEADERS, "Acp-Session-Id": acpTransportSessionId },
    rawBody: {
      jsonrpc: "2.0",
      id: 2,
      method: "session/new",
      params: { cwd: "/", mcpServers: [] },
    },
  });
  const sessRes = await readAcpRpcResult(sess.stream, 2);
  if (sessRes.error) {
    throw new Error(`ACP session/new failed: ${sessRes.error.message}`);
  }
  const acpSessionId = (sessRes.result as { sessionId?: string })?.sessionId;
  if (!acpSessionId) {
    throw new Error("ACP session/new returned no sessionId");
  }
  return { acpTransportSessionId, acpSessionId };
}

// transformAcpStream: takes an ACP SSE stream of JSON-RPC notifications
// and emits the simple {type:"chunk"|"done"|"error"} SSE format that the
// embed widget already understands. The widget stays protocol-agnostic.
function transformAcpStream(
  upstream: ReadableStream<Uint8Array>,
  promptId: number
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  function emit(controller: ReadableStreamDefaultController, evt: unknown) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
  }

  function handleEvent(
    controller: ReadableStreamDefaultController,
    raw: string
  ) {
    type AcpContent = { text?: string } | Array<{ text?: string }>;
    for (const evt of parseSSEDataLines(raw) as Array<{
      method?: string;
      params?: { update?: { sessionUpdate?: string; content?: AcpContent } };
      id?: number;
      result?: unknown;
      error?: { message: string };
    }>) {
      // ACP notification with content chunks. Goose emits `content` as a
      // singular object {type:"text", text:"..."} but the spec also allows
      // an array — handle both.
      if (evt.method === "session/update") {
        const upd = evt.params?.update;
        if (upd?.sessionUpdate === "agent_message_chunk" && upd.content) {
          const arr = Array.isArray(upd.content) ? upd.content : [upd.content];
          const text = arr.map((c) => c.text ?? "").join("");
          if (text) emit(controller, { type: "chunk", value: text });
        }
        continue;
      }
      // Final response to the original prompt id → done
      if (evt.id === promptId) {
        if (evt.error) {
          emit(controller, { type: "error", message: evt.error.message });
        } else {
          emit(controller, { type: "done" });
        }
      }
    }
  }

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            handleEvent(controller, event);
          }
        }
      } catch (e) {
        emit(controller, {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });
}

async function callHost<T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
  ownerId?: string
): Promise<T> {
  ensureConfigured();
  const url = `${HOST_URL.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${HOST_TOKEN}`,
    "Content-Type": "application/json",
  };
  if (ownerId) headers["X-Easybits-Owner"] = ownerId;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sandbox host ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export async function createSandbox(
  ctx: AuthContext,
  params: {
    template: SandboxTemplate;
    timeoutSeconds?: number;
    name?: string;
    metadata?: Record<string, string>;
  }
): Promise<SandboxRecord> {
  requireScope(ctx, "WRITE");
  const timeout = Math.min(
    Math.max(params.timeoutSeconds ?? DEFAULT_TIMEOUT_S, 30),
    MAX_TIMEOUT_S
  );
  return callHost<SandboxRecord>(
    "POST",
    "/v1/sandbox",
    { template: params.template, timeoutSeconds: timeout, name: params.name, metadata: params.metadata },
    ctx.user.id
  );
}

export async function listSandboxes(ctx: AuthContext): Promise<SandboxRecord[]> {
  requireScope(ctx, "READ");
  return callHost<SandboxRecord[]>("GET", `/v1/sandbox?owner=${ctx.user.id}`, undefined, ctx.user.id);
}

export async function getSandbox(ctx: AuthContext, sandboxId: string): Promise<SandboxRecord> {
  requireScope(ctx, "READ");
  return callHost<SandboxRecord>("GET", `/v1/sandbox/${sandboxId}`, undefined, ctx.user.id);
}

export interface WaitUntilRunningOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitUntilRunning(
  ctx: AuthContext,
  sandboxId: string,
  options: WaitUntilRunningOptions = {}
): Promise<SandboxRecord> {
  const { timeoutMs = 30_000, intervalMs = 500 } = options;
  const deadline = Date.now() + timeoutMs;
  let last: SandboxRecord | undefined;
  while (Date.now() <= deadline) {
    last = await getSandbox(ctx, sandboxId);
    if (last.status === "running") return last;
    if (last.status === "error") {
      const reason = last.metadata?.error ?? "unknown error";
      throw new Error(`sandbox ${sandboxId} failed to start: ${reason}`);
    }
    if (last.status === "stopped") {
      throw new Error(`sandbox ${sandboxId} is stopped`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `sandbox ${sandboxId} not running after ${timeoutMs}ms (last status=${last?.status ?? "unknown"})`
  );
}

export async function destroySandbox(ctx: AuthContext, sandboxId: string): Promise<{ ok: true }> {
  requireScope(ctx, "DELETE");
  return callHost<{ ok: true }>("DELETE", `/v1/sandbox/${sandboxId}`, undefined, ctx.user.id);
}

export async function execCommand(
  ctx: AuthContext,
  sandboxId: string,
  params: { command: string; cwd?: string; timeoutSeconds?: number; env?: Record<string, string> }
): Promise<ExecResult> {
  requireScope(ctx, "WRITE");
  return callHost<ExecResult>(
    "POST",
    `/v1/sandbox/${sandboxId}/exec`,
    {
      command: params.command,
      cwd: params.cwd,
      timeoutSeconds: Math.min(params.timeoutSeconds ?? 60, 600),
      env: params.env,
    },
    ctx.user.id
  );
}

export async function runCode(
  ctx: AuthContext,
  sandboxId: string,
  params: { code: string; lang?: "python" | "node" | "bash"; timeoutSeconds?: number }
): Promise<ExecResult> {
  requireScope(ctx, "WRITE");
  return callHost<ExecResult>(
    "POST",
    `/v1/sandbox/${sandboxId}/run-code`,
    {
      code: params.code,
      lang: params.lang ?? "python",
      timeoutSeconds: Math.min(params.timeoutSeconds ?? 60, 600),
    },
    ctx.user.id
  );
}

export async function writeFile(
  ctx: AuthContext,
  sandboxId: string,
  params: { path: string; content: string; encoding?: "utf8" | "base64" }
): Promise<{ ok: true; bytes: number }> {
  requireScope(ctx, "WRITE");
  return callHost<{ ok: true; bytes: number }>(
    "POST",
    `/v1/sandbox/${sandboxId}/files/write`,
    { path: params.path, content: params.content, encoding: params.encoding ?? "utf8" },
    ctx.user.id
  );
}

export async function readFile(
  ctx: AuthContext,
  sandboxId: string,
  params: { path: string; encoding?: "utf8" | "base64" }
): Promise<{ content: string; size: number; encoding: string }> {
  requireScope(ctx, "READ");
  const qs = new URLSearchParams({ path: params.path, encoding: params.encoding ?? "utf8" });
  return callHost(
    "GET",
    `/v1/sandbox/${sandboxId}/files/read?${qs.toString()}`,
    undefined,
    ctx.user.id
  );
}

export async function listFiles(
  ctx: AuthContext,
  sandboxId: string,
  params: { path: string }
): Promise<{ entries: FileEntry[] }> {
  requireScope(ctx, "READ");
  const qs = new URLSearchParams({ path: params.path });
  return callHost(
    "GET",
    `/v1/sandbox/${sandboxId}/files/list?${qs.toString()}`,
    undefined,
    ctx.user.id
  );
}

// ─────────────── Templates catalog ───────────────

export async function listTemplates(
  ctx: AuthContext,
  params: { tier?: TemplateInfo["tier"] } = {}
): Promise<TemplateInfo[]> {
  requireScope(ctx, "READ");
  const qs = params.tier ? `?tier=${encodeURIComponent(params.tier)}` : "";
  const out = await callHost<{ templates: TemplateInfo[] }>(
    "GET",
    `/v1/templates${qs}`,
    undefined,
    ctx.user.id
  );
  return out.templates;
}

// In-process cache of the catalog, 60s TTL. Catalog only changes on a
// sandbox-host redeploy + yaml update; rapid agent_create calls shouldn't
// pay a network round-trip per request.
let templatesCache: { tpls: TemplateInfo[]; expiresAt: number } | null = null;

async function resolveTemplate(
  ctx: AuthContext,
  name: SandboxTemplate
): Promise<TemplateInfo> {
  if (!templatesCache || Date.now() > templatesCache.expiresAt) {
    templatesCache = {
      tpls: await listTemplates(ctx),
      expiresAt: Date.now() + 60_000,
    };
  }
  const tpl = templatesCache.tpls.find((t) => t.name === name);
  if (!tpl) throw new Error(`Unknown template: ${name}`);
  return tpl;
}

// validateRequiredEnv: cruza el contrato del template con lo que llega.
// Sigue dos reglas:
//   1. Cada EnvSpec con `required: true` debe estar presente en `env`.
//   2. Caso especial Goose (oneOf): si `GOOSE_PROVIDER=anthropic` exige
//      ANTHROPIC_API_KEY; si `=openai` exige OPENAI_API_KEY. (Ad-hoc por
//      ahora — hasta que el schema soporte `required_if` genérico.)
function validateRequiredEnv(
  tpl: TemplateInfo,
  env: Record<string, string>
): void {
  const missing: string[] = [];
  for (const spec of tpl.requiredEnv ?? []) {
    if (spec.required && !(env[spec.name]?.trim())) {
      missing.push(spec.name);
    }
  }
  if (tpl.name === "goose") {
    const provider = env.GOOSE_PROVIDER || "anthropic";
    const need =
      provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : provider === "openai"
        ? "OPENAI_API_KEY"
        : null;
    if (need && !env[need]?.trim() && !missing.includes(need)) {
      missing.push(need);
    }
  }
  // chat-anthropic + openclaw accept ANTHROPIC_API_KEY OR ANTHROPIC_AUTH_TOKEN.
  // Managed mode (spawnAutonomous) injects AUTH_TOKEN when the host key
  // is OAuth (sk-ant-oat...) — strict required_env would reject this.
  if (tpl.name === "chat-anthropic" || tpl.name === "openclaw") {
    if (env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()) {
      const idx = missing.indexOf("ANTHROPIC_API_KEY");
      if (idx >= 0) missing.splice(idx, 1);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required env for template "${tpl.name}": ${missing.join(", ")}`
    );
  }
}

// ─────────────── Persistent agent lifecycle ───────────────

export interface AgentEndpoint {
  ok: true;
  agentUrl: string;
  healthUrl: string;
  unit?: string;
  port?: number;
}

export async function startAgent(
  ctx: AuthContext,
  sandboxId: string,
  params: {
    env: Record<string, string>;
    port?: number;
    healthPath?: string;
    timeoutSeconds?: number;
    unit?: string;
    envFile?: string;
  }
): Promise<AgentEndpoint> {
  requireScope(ctx, "WRITE");
  return callHost<AgentEndpoint>(
    "POST",
    `/v1/sandbox/${sandboxId}/agent/start`,
    {
      env: params.env,
      port: params.port,
      healthPath: params.healthPath,
      timeoutSeconds: params.timeoutSeconds ?? 30,
      unit: params.unit,
      envFile: params.envFile,
    },
    ctx.user.id
  );
}

// High-level: spawn sandbox + wait running + start agent runtime + persist Agent
// row + return public handles. Distinct from `agent_run` (Claude one-shot
// managed) — this returns a long-lived agent reachable at agentUrl + an
// embedToken that can authenticate browser requests without exposing the
// owner's API key.
export interface CreatedAgent {
  agentId: string;
  embedToken: string;
  sandboxId: string;
  agentUrl: string;
  healthUrl: string;
  template: SandboxTemplate;
  expiresAt: Date | null;
}

export async function createAgent(
  ctx: AuthContext,
  params: {
    template: SandboxTemplate;
    env: Record<string, string>;
    name?: string;
    timeoutSeconds?: number;
  }
): Promise<CreatedAgent> {
  requireScope(ctx, "WRITE");

  // Generate embedToken upfront — also serves as OPENCLAW_GATEWAY_TOKEN for
  // the openclaw runtime, so easybits can reuse it as Bearer when proxying
  // /v1/chat/completions without persisting a second per-agent secret.
  const embedToken = "agt_" + randomBytes(32).toString("hex");
  const env = { ...params.env };
  if (params.template === "openclaw") {
    env.OPENCLAW_GATEWAY_TOKEN = embedToken;
  }

  // 1. Resolve template + validate the env contract before spawning anything.
  const tpl = await resolveTemplate(ctx, params.template);
  validateRequiredEnv(tpl, env);

  // 2. Spawn microVM and wait for boot.
  const sb = await createSandbox(ctx, {
    template: params.template,
    timeoutSeconds: params.timeoutSeconds,
    name: params.name,
  });
  await waitUntilRunning(ctx, sb.sandboxId, { timeoutMs: 30_000 });

  // 3. Start the runtime unit declared by the template (default chat-runtime).
  const ep = await startAgent(ctx, sb.sandboxId, {
    env,
    port: tpl.agent?.port,
    healthPath: tpl.agent?.health_path,
    unit: tpl.agent?.unit,
    envFile: tpl.agent?.env_file,
  });

  // 4. ACP eager handshake — first user message has zero handshake cost.
  const protocol = tpl.agent?.protocol ?? "sse";
  const port = tpl.agent?.port ?? 3000;
  const messagePath = tpl.agent?.message_path ?? "/message";
  let acpSessionId: string | null = null;
  let acpTransportSessionId: string | null = null;
  if (protocol === "acp") {
    const handshake = await runAcpHandshake(sb.sandboxId, ctx.user.id, port, messagePath);
    acpSessionId = handshake.acpSessionId;
    acpTransportSessionId = handshake.acpTransportSessionId;
  }

  // 5. Persist Agent row with runtime metadata snapshot.
  const expiresAt = sb.expiresAt ? new Date(sb.expiresAt) : null;
  const row = await db.agent.create({
    data: {
      ownerId: ctx.user.id,
      sandboxId: sb.sandboxId,
      agentUrl: ep.agentUrl,
      template: params.template,
      embedToken,
      name: params.name,
      status: "running",
      expiresAt,
      protocol,
      port,
      unit: tpl.agent?.unit ?? "chat-runtime",
      messagePath,
      acpSessionId,
      acpTransportSessionId,
    },
  });
  return {
    agentId: row.id,
    embedToken,
    sandboxId: sb.sandboxId,
    template: params.template,
    agentUrl: ep.agentUrl,
    healthUrl: ep.healthUrl,
    expiresAt,
  };
}

// Managed-mode autonomous agents. Each brand maps to a default mascot name
// + system prompt. Backed by chat-anthropic runtime + host-managed
// credentials (SANDBOX_HOST_ANTHROPIC_KEY) — caller doesn't pass keys.
// The autonomous template (ghosty / nanoclaw / openclaw) declares image
// + tier in templates.yaml for catalog UI, but the actual runtime is
// always chat-anthropic; we'll diverge per-brand once each gets its own
// rootfs with channel integrations baked in.
const MANAGED_MODEL = "claude-haiku-4-5";

// BRAND_DEFAULTS: cada brand mapea a un template + nombre de mascota +
// system prompt + builder de env. Todos usan managed credentials del host.
//
// - ghosty/nanoclaw/openclaw → chat-anthropic runtime (SSE simple).
// - goose-managed → goose runtime (ACP). Prompt no se inyecta como env;
//   queda como Goose default por ahora (custom systemPrompt está en backlog).
type BrandConfig = {
  template: SandboxTemplate;
  name: string;
  prompt: string;
  envBuilder: (hostKey: string, isOAuth: boolean) => Record<string, string>;
};

const chatAnthropicEnv = (
  hostKey: string,
  isOAuth: boolean
): Record<string, string> =>
  isOAuth
    ? { ANTHROPIC_AUTH_TOKEN: hostKey, ANTHROPIC_MODEL: MANAGED_MODEL }
    : { ANTHROPIC_API_KEY: hostKey, ANTHROPIC_MODEL: MANAGED_MODEL };

// OpenClaw runtime expects ANTHROPIC_API_KEY como provider key + un
// OPENCLAW_GATEWAY_TOKEN para auth de la HTTP API en :18789.
// El gateway token NO lo generamos acá — createAgent inyecta el embedToken
// como OPENCLAW_GATEWAY_TOKEN antes de startAgent, así easybits puede
// reusarlo como Bearer al proxear /v1/chat/completions sin guardar un
// segundo secreto.
//
// openclaw: env vars per-provider los inyecta spawnAutonomous (depende del
// PROVIDER seleccionado). Acá retornamos vacío — solo el wrapper
// start-runtime.sh consume los envs específicos para escribir auth-profiles.
const openclawEnv = (
  _hostKey: string,
  _isOAuth: boolean,
): Record<string, string> => ({});

const BRAND_DEFAULTS: Record<string, BrandConfig> = {
  ghosty: {
    template: "chat-anthropic",
    name: "Ghosty",
    prompt:
      "Eres Ghosty, el agente oficial de WhatsApp de la marca Ghosty. Sé útil, " +
      "breve y directo. Habla en el idioma del usuario. Si no sabes algo, dilo.",
    envBuilder: chatAnthropicEnv,
  },
  nanoclaw: {
    template: "chat-anthropic",
    name: "Andy",
    prompt:
      "Eres Andy, el asistente de Nanoclaw para Slack y Microsoft Teams. " +
      "Conoces el flujo de canales corporativos y respondes en tono profesional " +
      "pero cercano. Sé conciso. Habla en el idioma del usuario.",
    envBuilder: chatAnthropicEnv,
  },
  openclaw: {
    template: "openclaw",
    name: "Molty",
    prompt:
      "Eres Molty, una langosta espacial. Asistente personal AI estilo " +
      "OpenClaw — multi-plataforma, OSS-first, sin filtros corporativos. " +
      "Sé útil, ingenioso y directo. Habla en el idioma del usuario.",
    envBuilder: openclawEnv,
  },
  "goose-managed": {
    template: "goose",
    name: "Goose",
    prompt: "", // Goose handles its own system prompt internally.
    envBuilder: (hostKey, isOAuth) => ({
      GOOSE_PROVIDER: "anthropic",
      GOOSE_MODEL: MANAGED_MODEL,
      // Goose accepts both OAuth and plain API keys under ANTHROPIC_API_KEY.
      ANTHROPIC_API_KEY: hostKey,
      ...(isOAuth ? {} : {}),
    }),
  },
};

function hostManagedAnthropicEnv(): Record<string, string> {
  const hostKey = process.env.SANDBOX_HOST_ANTHROPIC_KEY;
  if (!hostKey) {
    throw new Error(
      "Managed mode unavailable: SANDBOX_HOST_ANTHROPIC_KEY not configured."
    );
  }
  // OAuth tokens use Bearer (ANTHROPIC_AUTH_TOKEN); plain keys use x-api-key.
  const isOAuth = hostKey.startsWith("sk-ant-oat");
  return isOAuth
    ? { ANTHROPIC_AUTH_TOKEN: hostKey }
    : { ANTHROPIC_API_KEY: hostKey };
}

export type AutonomousBrand =
  | "ghosty"
  | "nanoclaw"
  | "openclaw"
  | "goose-managed";

export async function spawnAutonomous(
  ctx: AuthContext,
  params: {
    brand: AutonomousBrand;
    name?: string;
    systemPrompt?: string;
    /** "provider/model", e.g. "anthropic/claude-haiku-4-5". Defaults to MANAGED_MODEL on anthropic. */
    model?: string;
    /** User-provided plaintext API key for the selected provider (BYOK).
        Overrides host-managed key. Required for non-anthropic providers
        since only SANDBOX_HOST_ANTHROPIC_KEY exists in Fly secrets. */
    providerKey?: string;
    /** "api_key" → routea a *_API_KEY env (header x-api-key); "oauth" →
        routea a *_AUTH_TOKEN env (Bearer). Default detecta por prefix:
        sk-ant-oat → oauth, todo lo demás → api_key. */
    providerKeyKind?: "api_key" | "oauth";
    timeoutSeconds?: number;
  }
): Promise<CreatedAgent> {
  requireScope(ctx, "WRITE");
  const cfg = BRAND_DEFAULTS[params.brand];
  if (!cfg) {
    throw new Error(`Unknown autonomous brand: ${params.brand}`);
  }

  // Resolve provider + model. openclaw expects "provider/model"; chat-anthropic
  // pre-supposes anthropic.
  const [reqProvider, reqModel] = (params.model ?? `anthropic/${MANAGED_MODEL}`).split("/", 2);
  const provider = reqProvider || "anthropic";
  const model = reqModel || MANAGED_MODEL;

  // Auth resolution: BYOK takes precedence; fall back to host-managed key
  // (only anthropic supported today). Throw clear error otherwise.
  let providerKey = params.providerKey?.trim();
  let isOAuth = params.providerKeyKind === "oauth";
  if (!providerKey) {
    if (provider !== "anthropic") {
      throw new Error(
        `Provider "${provider}" requires the user to save their API key in /app/settings/credentials. Only anthropic has a host-managed fallback.`
      );
    }
    providerKey = process.env.SANDBOX_HOST_ANTHROPIC_KEY;
    if (!providerKey) {
      throw new Error(
        "Managed mode unavailable: SANDBOX_HOST_ANTHROPIC_KEY not configured."
      );
    }
    isOAuth = providerKey.startsWith("sk-ant-oat");
  } else if (params.providerKeyKind === undefined && provider === "anthropic") {
    // Backward-compat: si el caller no pasó kind explícito y el key tiene
    // prefix sk-ant-oat, lo tratamos como oauth.
    isOAuth = providerKey.startsWith("sk-ant-oat");
  }

  // Build env: provider-specific *_API_KEY/*_AUTH_TOKEN + brand-shared envs.
  // The runtime wrapper (start-runtime.sh) reads these and writes the right
  // auth-profiles.json entry: AUTH_TOKEN env → type:"token", API_KEY → "api_key".
  const env: Record<string, string> = cfg.envBuilder(providerKey, isOAuth);
  if (provider === "anthropic") {
    if (isOAuth) {
      env.ANTHROPIC_AUTH_TOKEN = providerKey;
      env.ANTHROPIC_API_KEY = providerKey; // some openclaw paths still read API_KEY
    } else {
      env.ANTHROPIC_API_KEY = providerKey;
    }
  }
  if (provider === "openai") {
    if (isOAuth) {
      env.OPENAI_AUTH_TOKEN = providerKey;
    } else {
      env.OPENAI_API_KEY = providerKey;
    }
  }
  if (provider === "google") env.GEMINI_API_KEY = providerKey;
  if (provider === "deepseek") env.DEEPSEEK_API_KEY = providerKey;
  if (provider === "openrouter") env.OPENROUTER_API_KEY = providerKey;

  if (cfg.template === "chat-anthropic" || cfg.template === "openclaw") {
    env.SYSTEM_PROMPT = params.systemPrompt ?? cfg.prompt;
  }

  if (cfg.template === "openclaw") {
    env.PROVIDER = provider;
    env.MODEL = model;
  } else if (cfg.template === "chat-anthropic") {
    env.ANTHROPIC_MODEL = model;
  }

  return createAgent(ctx, {
    template: cfg.template,
    name: params.name ?? cfg.name,
    timeoutSeconds: params.timeoutSeconds,
    env,
  });
}

// Back-compat: spawnGhosty stays as a thin wrapper.
export async function spawnGhosty(
  ctx: AuthContext,
  params: { name?: string; systemPrompt?: string; timeoutSeconds?: number } = {}
): Promise<CreatedAgent> {
  return spawnAutonomous(ctx, { brand: "ghosty", ...params });
}

// ─────────────── Agent registry (Mongo-backed) ───────────────

export interface AgentRecord {
  agentId: string;
  ownerId: string;
  sandboxId: string;
  agentUrl: string;
  template: string;
  embedToken: string;
  name: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  // Runtime metadata snapshot (Prisma defaults if missing).
  protocol: string;
  port: number;
  unit: string;
  messagePath: string;
  acpSessionId: string | null;
  acpTransportSessionId: string | null;
}

function toAgentRecord(row: {
  id: string;
  ownerId: string;
  sandboxId: string;
  agentUrl: string;
  template: string;
  embedToken: string;
  name: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  protocol: string | null;
  port: number | null;
  unit: string | null;
  messagePath: string | null;
  acpSessionId: string | null;
  acpTransportSessionId: string | null;
}): AgentRecord {
  return {
    agentId: row.id,
    ownerId: row.ownerId,
    sandboxId: row.sandboxId,
    agentUrl: row.agentUrl,
    template: row.template,
    embedToken: row.embedToken,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    protocol: row.protocol ?? "sse",
    port: row.port ?? 3000,
    unit: row.unit ?? "chat-runtime",
    messagePath: row.messagePath ?? "/message",
    acpSessionId: row.acpSessionId,
    acpTransportSessionId: row.acpTransportSessionId,
  };
}

// Owner-only — looks up an agent by id and confirms ownership.
export async function getAgent(ctx: AuthContext, agentId: string): Promise<AgentRecord> {
  requireScope(ctx, "READ");
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  return toAgentRecord(row);
}

export async function listAgents(ctx: AuthContext): Promise<AgentRecord[]> {
  requireScope(ctx, "READ");
  const rows = await db.agent.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toAgentRecord);
}

export async function destroyAgent(ctx: AuthContext, agentId: string): Promise<{ ok: true }> {
  requireScope(ctx, "DELETE");
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  try {
    await destroySandbox(ctx, row.sandboxId);
  } catch {
    // sandbox may already be gone (TTL expired) — proceed to row delete
  }
  await db.agent.delete({ where: { id: agentId } });
  return { ok: true };
}

// extendAgent: empuja expiresAt hacia adelante para keep-alive desde la UI.
// Llama al sandbox-host (que reagenda su timer interno) y refleja la nueva
// expiresAt en el Agent row. extendSeconds default = 300 (5min); el host
// clampa a [30, 3600] y limita a un máximo de 3600s desde ahora.
export async function extendAgent(
  ctx: AuthContext,
  agentId: string,
  extendSeconds?: number
): Promise<AgentRecord> {
  requireScope(ctx, "WRITE");
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  if (row.status !== "running") {
    throw new Error(`agent is ${row.status}; cannot extend`);
  }
  const sb = await callHost<SandboxRecord>(
    "POST",
    `/v1/sandbox/${row.sandboxId}/extend`,
    { extendSeconds: extendSeconds ?? 300 },
    ctx.user.id
  );
  const newExpiresAt = sb.expiresAt ? new Date(sb.expiresAt) : null;
  const updated = await db.agent.update({
    where: { id: agentId },
    data: { expiresAt: newExpiresAt },
  });
  return toAgentRecord(updated);
}

// markAgentLost: caller (UI loader) ya detectó que el sandbox subyacente
// no responde (probe HTTP falló). Persiste el estado en Mongo así otros
// consumidores no ven datos engañosos. Truncate expiresAt a now() para
// que los countdowns de UI no mientan.
export async function markAgentLost(
  ctx: AuthContext,
  agentId: string
): Promise<{ ok: true }> {
  requireScope(ctx, "WRITE");
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  await db.agent.update({
    where: { id: agentId },
    data: { status: "lost", expiresAt: new Date() },
  });
  return { ok: true };
}

// resolveAgentByEmbedToken: read-only path for embed auth in apiAuth helper.
// Returns the agent if the token matches; null otherwise. Does NOT enforce
// scope — caller decides what the embed token is allowed to do.
export async function findAgentByEmbedToken(token: string): Promise<AgentRecord | null> {
  if (!token.startsWith("agt_")) return null;
  const row = await db.agent.findUnique({ where: { embedToken: token } });
  return row ? toAgentRecord(row) : null;
}

// openAgentChunkStream: high-level. Resuelve el agent record, dispatcha
// por protocol y devuelve un ReadableStream UNIFORME con eventos
// {type:"chunk"|"done"|"error"} sin importar si el upstream es chat-runtime
// SSE o Goose ACP. El embed widget consume esto sin saber qué protocolo
// está atrás.
//
// Used by /api/v2/agents/:id/message (route público) y por messageAgent
// (sync MCP tool).
export async function openAgentChunkStream(
  agent: Pick<
    AgentRecord,
    | "agentId"
    | "ownerId"
    | "sandboxId"
    | "protocol"
    | "port"
    | "messagePath"
    | "acpSessionId"
    | "acpTransportSessionId"
    | "embedToken"
    | "template"
  >,
  body: { content: string; sessionId?: string }
): Promise<ReadableStream<Uint8Array>> {
  const protocol = agent.protocol ?? "sse";
  if (protocol === "sse") {
    // Pass-through: chat-runtime ya emite {type:"token"|"done"} format.
    // Translate "token" → "chunk" so downstream consumers ven el mismo
    // shape unificado.
    const upstream = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
      content: body.content,
      sessionId: body.sessionId,
      port: agent.port ?? undefined,
      path: agent.messagePath ?? undefined,
    });
    return mapSSETokenToChunk(upstream.stream);
  }
  if (protocol === "acp") {
    if (!agent.acpSessionId) {
      throw new Error("ACP agent missing sessionId — handshake not completed");
    }
    if (!agent.acpTransportSessionId) {
      throw new Error("ACP agent missing transport session id");
    }
    const promptId = Date.now() & 0x7fffffff;
    const upstream = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
      port: agent.port ?? 3284,
      path: agent.messagePath ?? "/acp",
      headers: { ...ACP_HEADERS, "Acp-Session-Id": agent.acpTransportSessionId },
      rawBody: {
        jsonrpc: "2.0",
        id: promptId,
        method: "session/prompt",
        params: {
          sessionId: agent.acpSessionId,
          prompt: [{ type: "text", text: body.content }],
        },
      },
    });
    return transformAcpStream(upstream.stream, promptId);
  }
  if (protocol === "http") {
    // OpenClaw gateway expone /v1/chat/completions compatible con OpenAI.
    // POST con stream:true → SSE con OpenAI delta chunks. Bearer token =
    // embedToken (createAgent lo inyecta como OPENCLAW_GATEWAY_TOKEN).
    const upstream = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
      port: agent.port ?? 18789,
      path: agent.messagePath ?? "/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${agent.embedToken}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      rawBody: {
        model: `${agent.template}/default`,
        messages: [{ role: "user", content: body.content }],
        stream: true,
        user: body.sessionId ?? "default",
      },
    });
    return mapOpenAIDeltaToChunk(upstream.stream);
  }
  throw new Error(`Unsupported agent protocol: ${protocol}`);
}

// Translate OpenAI-compatible SSE chunks (`data: {choices:[{delta:{content}}]}`)
// to unified {type:"chunk",value} stream. Stops on `data: [DONE]` → emits
// {type:"done"}. Network errors → {type:"error",message}.
function mapOpenAIDeltaToChunk(
  upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const emit = (evt: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            for (const line of event.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6);
              if (payload === "[DONE]") {
                emit({ type: "done" });
                continue;
              }
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = parsed.choices?.[0]?.delta?.content ?? "";
                if (text) emit({ type: "chunk", value: text });
              } catch {
                // ignore malformed payloads
              }
            }
          }
        }
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
}

// Translate chat-runtime SSE events {type:"token",value} → unified {type:"chunk",value}.
// Pass-through {type:"done"} and {type:"error"} verbatim.
function mapSSETokenToChunk(
  upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            for (const evt of parseSSEDataLines(event) as Array<{
              type?: string;
              value?: string;
              message?: string;
            }>) {
              if (evt.type === "token" && typeof evt.value === "string") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "chunk", value: evt.value })}\n\n`
                  )
                );
              } else if (evt.type === "done") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
              } else if (evt.type === "error") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "error", message: evt.message ?? "unknown" })}\n\n`
                  )
                );
              }
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

// messageAgent: sync wrapper sobre openAgentChunkStream. Para MCP callers
// (non-streaming). Real-time streaming va por /api/v2/agents/:id/message.
export async function messageAgent(
  ctx: AuthContext,
  params: { agentId: string; content: string; sessionId?: string }
): Promise<{ content: string; tokens: number }> {
  requireScope(ctx, "WRITE");
  const row = await db.agent.findUnique({ where: { id: params.agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  const stream = await openAgentChunkStream(toAgentRecord(row), {
    content: params.content,
    sessionId: params.sessionId,
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let tokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      for (const evt of parseSSEDataLines(event) as Array<{
        type?: string;
        value?: string;
        message?: string;
      }>) {
        if (evt.type === "chunk" && typeof evt.value === "string") {
          assembled += evt.value;
          tokens++;
        } else if (evt.type === "error") {
          throw new Error(`agent stream error: ${evt.message}`);
        }
      }
    }
  }
  return { content: assembled, tokens };
}
