import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { logAiUsage } from "../aiGenerationLimit";
import { computeCostCents } from "./llmPricing";
import {
  createSandbox,
  destroySandbox,
  execCommand,
  waitUntilRunning,
  writeFile as sandboxWriteFile,
  type ExecResult,
} from "./sandboxOperations";

const HOST_ANTHROPIC_KEY = process.env.SANDBOX_HOST_ANTHROPIC_KEY || "";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TURNS = 30;
const RESULT_MARKER = "__AGENT_RESULT__";
const EPHEMERAL_TTL_S = 600;
const EXEC_TIMEOUT_S = 540;

export interface AgentRunParams {
  prompt: string;
  sandboxId?: string;
  system?: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, unknown>;
}

export interface AgentStep {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

export interface AgentRunResult {
  response: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
  steps: AgentStep[];
  stopReason: string;
  sandboxId: string;
  ephemeral: boolean;
  durationMs: number;
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
}

const AGENT_SCRIPT = `
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
const maxTurns = parseInt(process.env.MAX_TURNS || "${DEFAULT_MAX_TURNS}", 10);
const allowedTools = parseJson(process.env.ALLOWED_TOOLS_B64, null);
const mcpServers = parseJson(process.env.MCP_SERVERS_B64, null);

const options = { model, maxTurns };
if (customSystem) {
  options.systemPrompt = customSystem;
}
if (Array.isArray(allowedTools) && allowedTools.length > 0) {
  options.allowedTools = allowedTools;
}
if (mcpServers && typeof mcpServers === "object") {
  options.mcpServers = mcpServers;
}

const steps = [];
let finalText = "";
let resultModel = model;
let usage = { input_tokens: 0, output_tokens: 0 };
let totalCostUsd = 0;
let stopReason = "unknown";
let success = true;
let errorMessage = null;

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
              step.result = typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
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

  process.stdout.write(
    "\\n${RESULT_MARKER}" +
      JSON.stringify({
        response: finalText,
        model: resultModel,
        usage,
        totalCostUsd,
        steps,
        stopReason,
        success,
        error: errorMessage,
      })
  );
})().catch((err) => {
  process.stderr.write(String((err && err.stack) || err));
  process.exit(1);
});
`;

function parseResult(stdout: string): AgentScriptResult {
  const idx = stdout.lastIndexOf(RESULT_MARKER);
  if (idx === -1) {
    throw new Error(
      `agent script did not emit ${RESULT_MARKER} (stdout tail: ${stdout.slice(-500)})`
    );
  }
  const json = stdout.slice(idx + RESULT_MARKER.length).trim();
  return JSON.parse(json) as AgentScriptResult;
}

export async function runAgent(
  ctx: AuthContext,
  params: AgentRunParams
): Promise<AgentRunResult> {
  requireScope(ctx, "WRITE");

  if (!HOST_ANTHROPIC_KEY) {
    throw new Error(
      "agent_run not configured: SANDBOX_HOST_ANTHROPIC_KEY env var missing"
    );
  }

  const model = params.model || DEFAULT_MODEL;
  const maxTurns = params.maxTurns || DEFAULT_MAX_TURNS;

  let sandboxId = params.sandboxId;
  let ephemeral = false;
  if (!sandboxId) {
    const sb = await createSandbox(ctx, {
      template: "node-agent",
      timeoutSeconds: EPHEMERAL_TTL_S,
      name: "agent-run",
      metadata: { kind: "agent_run" },
    });
    sandboxId = sb.sandboxId;
    ephemeral = true;
  }

  const cleanup = async () => {
    if (ephemeral && sandboxId) {
      destroySandbox(ctx, sandboxId).catch(() => {});
    }
  };

  const startedAt = Date.now();
  const scriptPath = `/tmp/agent_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.js`;
  let exec: ExecResult;
  try {
    await waitUntilRunning(ctx, sandboxId);
    await sandboxWriteFile(ctx, sandboxId, {
      path: scriptPath,
      content: AGENT_SCRIPT,
    });
    exec = await execCommand(ctx, sandboxId, {
      command: `node ${scriptPath}`,
      timeoutSeconds: EXEC_TIMEOUT_S,
      env: {
        // NODE_PATH lets `require("@anthropic-ai/claude-agent-sdk")` resolve
        // the globally pre-baked SDK in the node-agent template. Dockerfile
        // ENV doesn't propagate to systemd-spawned shell sessions, so we set
        // it per-call.
        NODE_PATH: "/usr/local/lib/node_modules",
        ANTHROPIC_API_KEY: HOST_ANTHROPIC_KEY,
        PROMPT_B64: Buffer.from(params.prompt, "utf8").toString("base64"),
        SYSTEM_B64: params.system
          ? Buffer.from(params.system, "utf8").toString("base64")
          : "",
        MODEL: model,
        MAX_TURNS: String(maxTurns),
        ALLOWED_TOOLS_B64: params.allowedTools
          ? Buffer.from(JSON.stringify(params.allowedTools), "utf8").toString(
              "base64"
            )
          : "",
        MCP_SERVERS_B64: params.mcpServers
          ? Buffer.from(JSON.stringify(params.mcpServers), "utf8").toString(
              "base64"
            )
          : "",
      },
    });
  } catch (err) {
    await cleanup();
    throw err;
  }

  const durationMs = Date.now() - startedAt;

  if (exec.exitCode !== 0) {
    await cleanup();
    throw new Error(
      `agent script exited ${exec.exitCode}: ${exec.stderr.slice(0, 1000)}`
    );
  }

  const out = parseResult(exec.stdout);
  if (!out.success) {
    await cleanup();
    throw new Error(`agent run failed: ${out.error || out.stopReason}`);
  }

  const inputTokens = out.usage.input_tokens || 0;
  const outputTokens = out.usage.output_tokens || 0;
  // Prefer the SDK's total_cost_usd when present (accounts for cache pricing
  // and per-tool pricing); fall back to our own pricing table for safety.
  const costCents =
    out.totalCostUsd > 0
      ? Math.round(out.totalCostUsd * 100)
      : computeCostCents(out.model, inputTokens, outputTokens);

  logAiUsage(ctx.user.id, {
    type: "agent_run",
    product: "agent",
    cost: costCents,
    modelId: out.model,
    inputTokens,
    outputTokens,
    resourceId: sandboxId,
    durationMs,
  });

  await cleanup();

  return {
    response: out.response,
    model: out.model,
    usage: { inputTokens, outputTokens, costCents },
    steps: out.steps,
    stopReason: out.stopReason,
    sandboxId,
    ephemeral,
    durationMs,
  };
}
