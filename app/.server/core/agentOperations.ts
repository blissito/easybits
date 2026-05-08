import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { logAiUsage } from "../aiGenerationLimit";
import { computeCostCents } from "./llmPricing";
import {
  createSandbox,
  destroySandbox,
  execCommand,
  getSandbox,
  listSandboxes,
  readFile as sandboxReadFile,
  waitUntilRunning,
  writeFile as sandboxWriteFile,
} from "./sandboxOperations";
import { getSecretValue } from "./secretOperations";
import { createApiKey } from "../iam";

const EASYBITS_BASE_URL =
  process.env.EASYBITS_URL || "https://www.easybits.cloud";

// Env var names buildEnv() owns. A user-supplied secret with the same name
// would silently break the sandbox (e.g. swap NODE_PATH and break require).
// ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_AUTH_TOKEN are
// NOT reserved — passing them via secrets switches the run to BYOK
// (Bring Your Own Key) mode and skips Claude billing. OAuth wins over
// API key when both are supplied.
const RESERVED_ENV_NAMES = new Set([
  "NODE_PATH",
  "RESULT_PATH",
  "PROMPT_B64",
  "SYSTEM_B64",
  "MODEL",
  "MAX_TURNS",
  "ALLOWED_TOOLS_B64",
  "MCP_SERVERS_B64",
]);

// Marker file written when the run uses a user-supplied ANTHROPIC_API_KEY.
// Presence of this flag makes getAgentRunStatus skip Claude-token billing.
const BYOK_FLAG_PATH = "/tmp/agent_byok.flag";

// Pool busy-flag (a directory because mkdir is atomic in POSIX, succeeds
// only if the dir didn't exist — that's our acquire primitive). Released
// by the agent script in writeResult() once the loop finishes.
const POOL_FLAG_PATH = "/tmp/agent_running.flag";

// Default warm-pool size when caller passes pool_key without pool_size.
// 2 covers the common case (e.g. a screenshot job firing 2 viewports in
// parallel) without holding a lot of compute idle.
const DEFAULT_POOL_SIZE = 2;

// Host-level Anthropic credentials — used when the caller did NOT pass
// their own via secrets:[\"ANTHROPIC_API_KEY\"] or secrets:[\"CLAUDE_CODE_OAUTH_TOKEN\"].
// Priority: OAuth token (Max plan, no per-token billing) → API key fallback.
// The Anthropic SDK reads ANTHROPIC_AUTH_TOKEN for OAuth and ANTHROPIC_API_KEY
// for API-key auth, so we just route into whichever the host has set.
// Note: this gives no automatic 429 fallback inside the sandbox — that's
// what nanoclaw's credential-proxy does. If we hit OAuth quota and need
// graceful degradation, we'd need a proxy on localhost inside the VM.
const HOST_OAUTH_TOKEN =
  process.env.SANDBOX_HOST_OAUTH_TOKEN ||
  process.env.CLAUDE_CODE_OAUTH_TOKEN ||
  "";
const HOST_ANTHROPIC_KEY = process.env.SANDBOX_HOST_ANTHROPIC_KEY || "";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const SANDBOX_TTL_S = 1800; // 30 min — the real cap on a runaway loop.
const LAUNCHER_EXEC_TIMEOUT_S = 30;
const SCRIPT_PATH = "/tmp/agent.js";
const RESULT_PATH = "/tmp/agent_result.json";
const LOG_PATH = "/tmp/agent.log";
// Marker file written *inside the sandbox* once billing has fired for this
// run. Subsequent status calls see the marker and skip the bill — making
// agent_run_status idempotent so a buggy poll loop can't burn quota.
const BILLED_FLAG_PATH = "/tmp/agent_billed.flag";

export interface AgentRunParams {
  prompt: string;
  system?: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, unknown>;
  secrets?: string[];
  poolKey?: string;
  poolSize?: number;
}

export interface AgentStep {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

export interface EnqueueAgentRunResult {
  jobId: string;
  status: "running";
}

export type AgentRunStatus = "running" | "done" | "error" | "expired";

export interface AgentRunStatusResult {
  jobId: string;
  status: AgentRunStatus;
  response?: string;
  steps?: AgentStep[];
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    byok?: boolean;
  };
  model?: string;
  durationMs?: number;
  error?: string;
  log?: string;
}

interface AgentScriptResult {
  response: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  totalCostUsd: number;
  steps: AgentStep[];
  stopReason: string;
  success: boolean;
  error: string | null;
  startedAt: number;
  finishedAt: number;
}

// Script that runs *inside* the sandbox microVM. Writes its final JSON
// payload to RESULT_PATH instead of stdout, because the Claude Agent SDK's
// underlying native binary writes its own protocol frames and logs to
// stdout/stderr.
const AGENT_SCRIPT = `
const fs = require("fs");
const { query } = require("@anthropic-ai/claude-agent-sdk");

const decode = (b64) => Buffer.from(b64 || "", "base64").toString("utf8");
const parseJson = (b64, fallback) => {
  const raw = decode(b64);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const userPrompt = decode(process.env.PROMPT_B64);
const customSystem = decode(process.env.SYSTEM_B64) || null;
const model = process.env.MODEL || "${DEFAULT_MODEL}";
const maxTurnsRaw = process.env.MAX_TURNS;
const maxTurns = maxTurnsRaw ? parseInt(maxTurnsRaw, 10) : null;
const allowedTools = parseJson(process.env.ALLOWED_TOOLS_B64, null);
const mcpServers = parseJson(process.env.MCP_SERVERS_B64, null);
const resultPath = process.env.RESULT_PATH;

// Headless defaults — without these the SDK auto-loads Agent (subagents),
// AskUserQuestion (interactive), Skill (.claude/skills/), TodoWrite, etc.
// In an ephemeral VM with no user and no Claude Code session, the agent
// gets stuck looking for /root/.claude/settings.json instead of doing its
// job. permissionMode:"dontAsk" denies anything not in allowedTools.
const DEFAULT_ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"];
const DEFAULT_DISALLOWED_TOOLS = ["Agent", "AskUserQuestion", "Skill", "TodoWrite", "ToolSearch", "Monitor"];
const DEFAULT_SYSTEM_PROMPT = [
  "You are a non-interactive agent running inside an ephemeral Firecracker microVM.",
  "Environment: Debian (node:22-slim base), Node 22, root user, internet open, no persistence — the VM is destroyed when you finish.",
  "There is NO Claude Code session and NO project: do not search for .claude directories, settings.json, or skills. They do not exist.",
  "Do not ask the user questions; you have no human to talk to. Do not spawn subagents.",
  "Use Bash/Read/Write/Edit/Glob/Grep/WebFetch and any provided MCP tools. /tmp is your scratch space.",
  "Prefer MCP tools over installing SDKs — when an MCP server is wired for a service, it is already authenticated and saves ~15s of cold-start install time per run. Only fall back to npm install + SDK if no MCP tool covers the operation you need.",
  "Install only what's strictly needed for the task. Pip on Debian needs --break-system-packages.",
  "Finish by emitting a clear final summary (paths of outputs, sizes, key facts).",
].join(" ");

let systemPrompt = customSystem || DEFAULT_SYSTEM_PROMPT;
if (mcpServers && typeof mcpServers === "object") {
  const names = Object.keys(mcpServers);
  if (names.length > 0) {
    const list = names.map((n) => "mcp__" + n + "__*").join(", ");
    systemPrompt += " MCP tools available in this run: " + list + ". Use them by their full mcp__<server>__<tool> name and prefer them over WebFetch/Bash/npm-install when relevant to the task.";
  }
}

const baseAllowed = Array.isArray(allowedTools) && allowedTools.length > 0 ? allowedTools : DEFAULT_ALLOWED_TOOLS;
const mcpWildcards = mcpServers && typeof mcpServers === "object"
  ? Object.keys(mcpServers).map((n) => "mcp__" + n + "__*")
  : [];
const options = {
  model,
  allowedTools: Array.from(new Set([...baseAllowed, ...mcpWildcards])),
  disallowedTools: DEFAULT_DISALLOWED_TOOLS,
  permissionMode: "dontAsk",
  systemPrompt,
};
if (maxTurns) options.maxTurns = maxTurns;
if (mcpServers && typeof mcpServers === "object") options.mcpServers = mcpServers;

const startedAt = Date.now();
const steps = [];
let finalText = "";
let resultModel = model;
let usage = { input_tokens: 0, output_tokens: 0 };
let totalCostUsd = 0;
let stopReason = "unknown";
let success = true;
let errorMessage = null;

const writeResult = () => {
  fs.writeFileSync(resultPath, JSON.stringify({
    response: finalText,
    model: resultModel,
    usage,
    totalCostUsd,
    steps,
    stopReason,
    success,
    error: errorMessage,
    startedAt,
    finishedAt: Date.now(),
  }));
  // Release the pool busy-flag (no-op when this VM isn't pooled).
  try { fs.rmdirSync("${POOL_FLAG_PATH}"); } catch {}
};

(async () => {
  try {
    for await (const message of query({ prompt: userPrompt, options })) {
      if (message.type === "assistant" && message.message && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            steps.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
          }
        }
      } else if (message.type === "user" && message.message && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_result") {
            const step = steps.find((s) => s.id === block.tool_use_id);
            if (step) {
              step.result = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
              step.isError = !!block.is_error;
            }
          }
        }
      } else if (message.type === "result") {
        success = message.subtype === "success";
        if (!success) errorMessage = message.subtype;
        finalText = message.result || "";
        if (message.usage) usage = message.usage;
        if (message.model) resultModel = message.model;
        if (typeof message.total_cost_usd === "number") totalCostUsd = message.total_cost_usd;
        stopReason = message.subtype || "unknown";
      }
    }
  } catch (err) {
    success = false;
    errorMessage = String((err && err.message) || err);
  }
  writeResult();
})().catch((err) => {
  success = false;
  errorMessage = String((err && err.stack) || err);
  try { writeResult(); } catch {}
  process.exit(1);
});
`;

// `$secret:NAME` placeholders in mcp_servers[*].env let the caller wire a
// secret into a child MCP under whatever name that MCP expects, without
// the plaintext ever leaving the EasyBits server. Example: brightdata's
// MCP reads `API_TOKEN`, but the user's secret is registered as
// `BRIGHTDATA_API_TOKEN` — they pass `env: { API_TOKEN: "$secret:BRIGHTDATA_API_TOKEN" }`.
const SECRET_REF_RE = /^\$secret:([A-Z_][A-Z0-9_]*)$/;

function expandMcpServerSecrets(
  mcpServers: Record<string, unknown> | undefined,
  resolvedSecrets: Record<string, string>
): Record<string, unknown> | undefined {
  if (!mcpServers) return mcpServers;
  const out: Record<string, unknown> = {};
  for (const [serverName, rawCfg] of Object.entries(mcpServers)) {
    if (!rawCfg || typeof rawCfg !== "object") {
      out[serverName] = rawCfg;
      continue;
    }
    const cfg = rawCfg as Record<string, unknown>;
    const env = cfg.env;
    if (!env || typeof env !== "object") {
      out[serverName] = cfg;
      continue;
    }
    const newEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      if (typeof v !== "string") {
        newEnv[k] = String(v);
        continue;
      }
      const m = v.match(SECRET_REF_RE);
      if (!m) {
        newEnv[k] = v;
        continue;
      }
      const secretName = m[1];
      if (!(secretName in resolvedSecrets)) {
        throw new Error(
          `mcp_servers.${serverName}.env.${k} references $secret:${secretName} but ${secretName} is not in the secrets[] list. Add it to secrets[] so it gets resolved.`
        );
      }
      newEnv[k] = resolvedSecrets[secretName];
    }
    out[serverName] = { ...cfg, env: newEnv };
  }
  return out;
}

function buildEnv(
  params: AgentRunParams,
  resolvedSecrets: Record<string, string>
): Record<string, string> {
  const model = params.model || DEFAULT_MODEL;
  // Auth selection: a user-supplied OAuth token wins over a user-supplied
  // API key (OAuth uses the Max plan, no per-token billing); host-level
  // OAuth wins over host-level API key for the same reason. We deliberately
  // emit ONLY ONE of the two env vars to avoid the SDK preferring the
  // wrong one (it picks ANTHROPIC_API_KEY ahead of ANTHROPIC_AUTH_TOKEN
  // when both are set).
  const userOAuth =
    resolvedSecrets.CLAUDE_CODE_OAUTH_TOKEN ||
    resolvedSecrets.ANTHROPIC_AUTH_TOKEN ||
    "";
  const userApiKey = resolvedSecrets.ANTHROPIC_API_KEY || "";
  const oauthToken = userOAuth || HOST_OAUTH_TOKEN;
  const apiKey = userApiKey || HOST_ANTHROPIC_KEY;
  const useOAuth = !!oauthToken;
  // Strip auth secrets from the spread — we re-emit them explicitly under
  // the names the SDK expects, avoiding double-set conflicts.
  const restSecrets: Record<string, string> = { ...resolvedSecrets };
  delete restSecrets.CLAUDE_CODE_OAUTH_TOKEN;
  delete restSecrets.ANTHROPIC_AUTH_TOKEN;
  delete restSecrets.ANTHROPIC_API_KEY;
  return {
    ...restSecrets,
    NODE_PATH: "/usr/local/lib/node_modules",
    ...(useOAuth
      ? { ANTHROPIC_AUTH_TOKEN: oauthToken }
      : { ANTHROPIC_API_KEY: apiKey }),
    RESULT_PATH,
    PROMPT_B64: Buffer.from(params.prompt, "utf8").toString("base64"),
    SYSTEM_B64: params.system
      ? Buffer.from(params.system, "utf8").toString("base64")
      : "",
    MODEL: model,
    MAX_TURNS: params.maxTurns ? String(params.maxTurns) : "",
    ALLOWED_TOOLS_B64: params.allowedTools
      ? Buffer.from(JSON.stringify(params.allowedTools), "utf8").toString("base64")
      : "",
    MCP_SERVERS_B64: params.mcpServers
      ? Buffer.from(JSON.stringify(params.mcpServers), "utf8").toString("base64")
      : "",
  };
}

export async function enqueueAgentRun(
  ctx: AuthContext,
  params: AgentRunParams
): Promise<EnqueueAgentRunResult> {
  requireScope(ctx, "WRITE");

  const resolvedSecrets: Record<string, string> = {};
  if (params.secrets?.length) {
    const collisions = params.secrets.filter((n) => RESERVED_ENV_NAMES.has(n));
    if (collisions.length) {
      throw new Error(
        `Cannot inject reserved env var name(s): ${collisions.join(", ")}. These are used internally by the agent runner.`
      );
    }
    const lookups = await Promise.all(
      params.secrets.map(async (name) => ({
        name,
        value: await getSecretValue(ctx.user.id, name),
      }))
    );
    const missing = lookups.filter((s) => s.value === null).map((s) => s.name);
    if (missing.length) {
      throw new Error(
        `Missing secrets for this account: ${missing.join(", ")}. Register via secret_set or /dash/developer/secrets.`
      );
    }
    for (const { name, value } of lookups) {
      resolvedSecrets[name] = value!;
    }
  }

  const byok =
    !!resolvedSecrets.ANTHROPIC_API_KEY ||
    !!resolvedSecrets.CLAUDE_CODE_OAUTH_TOKEN ||
    !!resolvedSecrets.ANTHROPIC_AUTH_TOKEN;
  const hostHasAuth = !!HOST_OAUTH_TOKEN || !!HOST_ANTHROPIC_KEY;
  if (!byok && !hostHasAuth) {
    throw new Error(
      "agent_run not configured: no Anthropic credentials available. Either register your own via secret_set + secrets:[\"ANTHROPIC_API_KEY\"] or secrets:[\"CLAUDE_CODE_OAUTH_TOKEN\"] (BYOK), or ask the operator to set SANDBOX_HOST_OAUTH_TOKEN / SANDBOX_HOST_ANTHROPIC_KEY."
    );
  }

  // Auto-inject EasyBits MCP unless caller already supplied one (or opted out
  // with `easybits: false`). Mints a per-run ApiKey scoped to the caller's
  // own scopes; expires shortly after the sandbox TTL so leaks are bounded.
  const callerEasybits = (params.mcpServers ?? {})["easybits"];
  let mcpServersWithDefault = params.mcpServers;
  if (callerEasybits === undefined) {
    const tempKey = await createApiKey(ctx.user.id, {
      name: `agent_run-${ctx.user.id}-${Date.now()}`,
      scopes: ctx.scopes,
      expiresAt: new Date(Date.now() + (SANDBOX_TTL_S + 300) * 1000),
    });
    mcpServersWithDefault = {
      easybits: {
        type: "http",
        url: `${EASYBITS_BASE_URL}/api/mcp`,
        headers: { Authorization: `Bearer ${tempKey.raw}` },
      },
      ...(params.mcpServers ?? {}),
    };
  } else if (callerEasybits === false) {
    const { easybits: _drop, ...rest } = params.mcpServers as Record<string, unknown>;
    mcpServersWithDefault = rest;
  }

  const expandedParams: AgentRunParams = {
    ...params,
    mcpServers: expandMcpServerSecrets(mcpServersWithDefault, resolvedSecrets),
  };

  // Pool warm-reuse — caller supplies a pool_key to opt in. We try to
  // acquire an idle sandbox already in the pool (mkdir of POOL_FLAG_PATH
  // is atomic in POSIX, so it doubles as our acquire primitive). If no
  // idle one is acquirable AND the pool is below pool_size, the new VM
  // joins the pool; otherwise it's spawned disposable so it doesn't
  // count against the pool cap.
  const poolKey = params.poolKey;
  const poolSize = Math.max(1, params.poolSize ?? DEFAULT_POOL_SIZE);
  let jobId = "";
  let createdNew = false;

  if (poolKey) {
    const candidates = (await listSandboxes(ctx).catch(() => []))
      .filter((s) => s.metadata?.pool_key === poolKey && s.status === "running");
    for (const c of candidates) {
      try {
        const r = await execCommand(ctx, c.sandboxId, {
          command: `mkdir ${POOL_FLAG_PATH} 2>/dev/null && echo OK || echo BUSY`,
          timeoutSeconds: 5,
        });
        if ((r.stdout || "").trim() === "OK") {
          jobId = c.sandboxId;
          // Reset prior-run state on the warm VM so the new run's status
          // and billing flags start clean. The script and pool flag stay.
          await execCommand(ctx, jobId, {
            command: `rm -f ${RESULT_PATH} ${LOG_PATH} ${BYOK_FLAG_PATH} ${BILLED_FLAG_PATH}`,
            timeoutSeconds: 5,
          }).catch(() => {});
          break;
        }
      } catch {
        /* try next candidate */
      }
    }
    if (!jobId) {
      const enterPool = candidates.length < poolSize;
      const sb = await createSandbox(ctx, {
        template: "node-agent",
        timeoutSeconds: SANDBOX_TTL_S,
        name: "agent-run",
        metadata: enterPool
          ? { kind: "agent_run", pool_key: poolKey }
          : { kind: "agent_run" },
      });
      jobId = sb.sandboxId;
      createdNew = true;
    }
  } else {
    const sb = await createSandbox(ctx, {
      template: "node-agent",
      timeoutSeconds: SANDBOX_TTL_S,
      name: "agent-run",
      metadata: { kind: "agent_run" },
    });
    jobId = sb.sandboxId;
    createdNew = true;
  }

  try {
    if (createdNew) {
      await waitUntilRunning(ctx, jobId);
      // Acquire the pool busy-flag on fresh sandboxes too — keeps the
      // release path uniform (the agent script's writeResult rmdir's it
      // either way; on disposable VMs the rmdir is a harmless no-op).
      await execCommand(ctx, jobId, {
        command: `mkdir ${POOL_FLAG_PATH}`,
        timeoutSeconds: 5,
      }).catch(() => {});
    }
    await sandboxWriteFile(ctx, jobId, {
      path: SCRIPT_PATH,
      content: AGENT_SCRIPT,
    });
    if (byok) {
      // Marker for getAgentRunStatus — read-side decides whether to bill.
      await sandboxWriteFile(ctx, jobId, {
        path: BYOK_FLAG_PATH,
        content: "1",
      });
    }
    // Detach so /exec returns immediately while the agent loop runs in
    // background. nohup + redirected stdio + disown survives the parent
    // shell exit.
    await execCommand(ctx, jobId, {
      command: `nohup node ${SCRIPT_PATH} > ${LOG_PATH} 2>&1 < /dev/null & disown`,
      timeoutSeconds: LAUNCHER_EXEC_TIMEOUT_S,
      env: buildEnv(expandedParams, resolvedSecrets),
    });
  } catch (err) {
    // Only destroy on failure if we created this VM. A reused pooled VM
    // stays alive (its busy-flag remains set so it won't be re-acquired
    // in a broken state; TTL cleans it up if nothing else does).
    if (createdNew) destroySandbox(ctx, jobId).catch(() => {});
    throw err;
  }

  return { jobId, status: "running" };
}

export async function getAgentRunStatus(
  ctx: AuthContext,
  jobId: string
): Promise<AgentRunStatusResult> {
  requireScope(ctx, "READ");

  // Confirm the sandbox is still around. If it expired (TTL hit) we lose
  // any result that wasn't fetched in time.
  let exists = true;
  try {
    await getSandbox(ctx, jobId);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("404") || msg.includes("not found")) {
      exists = false;
    } else {
      throw err;
    }
  }
  if (!exists) {
    return { jobId, status: "expired" };
  }

  // Try reading the result file. If absent, the agent is still running.
  let resultJson: string | null = null;
  try {
    const file = await sandboxReadFile(ctx, jobId, { path: RESULT_PATH });
    resultJson = file.content;
  } catch {
    return { jobId, status: "running" };
  }

  let out: AgentScriptResult;
  try {
    out = JSON.parse(resultJson) as AgentScriptResult;
  } catch (err) {
    const log = await sandboxReadFile(ctx, jobId, { path: LOG_PATH }).catch(
      () => ({ content: "" })
    );
    return {
      jobId,
      status: "error",
      error: `failed to parse agent result: ${String(err)}`,
      log: log.content?.slice(-2000) || "",
    };
  }

  const inputTokens = out.usage.input_tokens || 0;
  const outputTokens = out.usage.output_tokens || 0;
  // Prefer the SDK's total_cost_usd when present (it accounts for cache
  // pricing); fall back to our own pricing table for safety.
  const costCents =
    out.totalCostUsd > 0
      ? Math.round(out.totalCostUsd * 100)
      : computeCostCents(out.model, inputTokens, outputTokens);
  const durationMs = Math.max(0, (out.finishedAt || 0) - (out.startedAt || 0));

  // BYOK: caller supplied their own ANTHROPIC_API_KEY, so we don't bill the
  // Claude tokens (they paid Anthropic directly). Sandbox infra billing is
  // a separate concern, tracked elsewhere when we add it.
  let isByok = false;
  try {
    await sandboxReadFile(ctx, jobId, { path: BYOK_FLAG_PATH });
    isByok = true;
  } catch {
    /* host-key run */
  }

  // Idempotent billing: only fire once per sandbox lifetime. The flag file
  // lives inside the VM, which is the same process boundary as the result
  // file, so a successful read here implies the same VM produced both.
  let alreadyBilled = false;
  try {
    await sandboxReadFile(ctx, jobId, { path: BILLED_FLAG_PATH });
    alreadyBilled = true;
  } catch {
    /* no flag yet */
  }
  if (!alreadyBilled && !isByok) {
    logAiUsage(ctx.user.id, {
      type: "agent_run",
      product: "agent",
      cost: costCents,
      modelId: out.model,
      inputTokens,
      outputTokens,
      resourceId: jobId,
      durationMs,
    });
    await sandboxWriteFile(ctx, jobId, {
      path: BILLED_FLAG_PATH,
      content: String(costCents),
    }).catch(() => {});
  }

  return {
    jobId,
    status: out.success ? "done" : "error",
    response: out.response,
    steps: out.steps,
    stopReason: out.stopReason,
    usage: {
      inputTokens,
      outputTokens,
      costCents: isByok ? 0 : costCents,
      byok: isByok,
    },
    model: out.model,
    durationMs,
    error: out.error || undefined,
  };
}

export async function destroyAgentRun(
  ctx: AuthContext,
  jobId: string
): Promise<{ jobId: string; destroyed: boolean }> {
  requireScope(ctx, "WRITE");
  try {
    await destroySandbox(ctx, jobId);
    return { jobId, destroyed: true };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("404") || msg.includes("not found")) {
      return { jobId, destroyed: false };
    }
    throw err;
  }
}
