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
  | "chat-openai"
  | "chat-anthropic";

export interface AgentSpec {
  port?: number;
  protocol?: "http" | "sse" | "ws" | "cli-stdin";
  health_path?: string;
  health_command?: string;
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

// ─────────────── Persistent agent lifecycle ───────────────

export interface AgentEndpoint {
  ok: true;
  agentUrl: string;
  healthUrl: string;
}

export async function startAgent(
  ctx: AuthContext,
  sandboxId: string,
  params: {
    env: Record<string, string>;
    port?: number;
    healthPath?: string;
    timeoutSeconds?: number;
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
    },
    ctx.user.id
  );
}

// High-level: spawn sandbox + wait running + start agent runtime + return everything.
// Used by the `agent_create` MCP tool. Distinct from `agent_run` (Claude one-shot
// managed) — this returns a long-lived agent reachable at agentUrl.
export async function createAgent(
  ctx: AuthContext,
  params: {
    template: SandboxTemplate;
    env: Record<string, string>;
    name?: string;
    timeoutSeconds?: number;
    port?: number;
    healthPath?: string;
  }
): Promise<{ sandboxId: string; agentUrl: string; healthUrl: string; template: SandboxTemplate }> {
  requireScope(ctx, "WRITE");
  const sb = await createSandbox(ctx, {
    template: params.template,
    timeoutSeconds: params.timeoutSeconds,
    name: params.name,
  });
  await waitUntilRunning(ctx, sb.sandboxId, { timeoutMs: 30_000 });
  const ep = await startAgent(ctx, sb.sandboxId, {
    env: params.env,
    port: params.port,
    healthPath: params.healthPath,
  });
  return {
    sandboxId: sb.sandboxId,
    template: params.template,
    agentUrl: ep.agentUrl,
    healthUrl: ep.healthUrl,
  };
}

// spawnGhosty: zero-config persistent agent. Uses EasyBits' managed Anthropic
// key (same pattern as agent_run) — caller passes nothing required, gets back
// an agentUrl ready to message. The brand-default for "I just need an agent."
const GHOSTY_DEFAULT_PROMPT =
  "Eres Ghosty, el agente conversacional de EasyBits. Sé útil, breve y directo. " +
  "Habla en el idioma del usuario. Si no sabes algo, dilo.";

const GHOSTY_DEFAULT_MODEL = "claude-haiku-4-5";

export async function spawnGhosty(
  ctx: AuthContext,
  params: { name?: string; systemPrompt?: string; timeoutSeconds?: number } = {}
): Promise<{ sandboxId: string; agentUrl: string; healthUrl: string; template: SandboxTemplate }> {
  requireScope(ctx, "WRITE");
  const hostKey = process.env.SANDBOX_HOST_ANTHROPIC_KEY;
  if (!hostKey) {
    throw new Error(
      "Ghosty managed mode unavailable: SANDBOX_HOST_ANTHROPIC_KEY not configured."
    );
  }
  return createAgent(ctx, {
    template: "chat-anthropic",
    name: params.name ?? "ghosty",
    timeoutSeconds: params.timeoutSeconds,
    env: {
      ANTHROPIC_API_KEY: hostKey,
      ANTHROPIC_MODEL: GHOSTY_DEFAULT_MODEL,
      SYSTEM_PROMPT: params.systemPrompt ?? GHOSTY_DEFAULT_PROMPT,
    },
  });
}

// messageAgent: POST a message to a chat-* agent and collect the SSE stream
// into a single string. For MCP tool callers (non-streaming). Real-time
// streaming for embed widgets is exposed separately via the public
// /api/agents/:id/stream proxy (server-sent events end-to-end).
export async function messageAgent(
  ctx: AuthContext,
  params: { agentUrl: string; content: string; sessionId?: string }
): Promise<{ content: string; tokens: number }> {
  requireScope(ctx, "WRITE");
  const url = `${params.agentUrl.replace(/\/$/, "")}/message`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: params.content, sessionId: params.sessionId ?? "default" }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`agent /message → ${res.status}: ${text.slice(0, 500)}`);
  }
  const reader = res.body.getReader();
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
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const evt = JSON.parse(dataLine.slice(6));
        if (evt.type === "token" && typeof evt.value === "string") {
          assembled += evt.value;
          tokens++;
        } else if (evt.type === "error") {
          throw new Error(`agent stream error: ${evt.message}`);
        }
      } catch {
        // ignore non-JSON event lines
      }
    }
  }
  return { content: assembled, tokens };
}
