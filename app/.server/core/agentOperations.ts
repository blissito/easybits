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
const DEFAULT_MAX_TOKENS = 2048;
const RESULT_MARKER = "__AGENT_RESULT__";
const EPHEMERAL_TTL_S = 120;
const EXEC_TIMEOUT_S = 300;

export interface AgentRunParams {
  prompt: string;
  sandboxId?: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}

export interface AgentRunResult {
  response: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
  sandboxId: string;
  ephemeral: boolean;
  durationMs: number;
}

interface AgentScriptOutput {
  response: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

const AGENT_SCRIPT = `
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
const decode = (b64) => Buffer.from(b64 || "", "base64").toString("utf8");
const prompt = decode(process.env.PROMPT_B64);
const systemRaw = decode(process.env.SYSTEM_B64);
const system = systemRaw ? systemRaw : undefined;
const model = process.env.MODEL || "${DEFAULT_MODEL}";
const maxTokens = parseInt(process.env.MAX_TOKENS || "${DEFAULT_MAX_TOKENS}", 10);
(async () => {
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const text = (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  process.stdout.write(
    "\\n${RESULT_MARKER}" +
      JSON.stringify({ response: text, model: msg.model, usage: msg.usage })
  );
})().catch((err) => {
  process.stderr.write(String((err && err.stack) || err));
  process.exit(1);
});
`;

function parseResult(stdout: string): AgentScriptOutput {
  const idx = stdout.lastIndexOf(RESULT_MARKER);
  if (idx === -1) {
    throw new Error(
      `agent script did not emit ${RESULT_MARKER} (stdout tail: ${stdout.slice(-500)})`
    );
  }
  const json = stdout.slice(idx + RESULT_MARKER.length).trim();
  return JSON.parse(json) as AgentScriptOutput;
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
  const maxTokens = params.maxTokens || DEFAULT_MAX_TOKENS;

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
        // NODE_PATH lets `require("@anthropic-ai/sdk")` resolve the globally
        // pre-baked SDK in the node-agent template. Dockerfile ENV doesn't
        // propagate to systemd-spawned shell sessions, so we set it per-call.
        NODE_PATH: "/usr/local/lib/node_modules",
        ANTHROPIC_API_KEY: HOST_ANTHROPIC_KEY,
        PROMPT_B64: Buffer.from(params.prompt, "utf8").toString("base64"),
        SYSTEM_B64: params.system
          ? Buffer.from(params.system, "utf8").toString("base64")
          : "",
        MODEL: model,
        MAX_TOKENS: String(maxTokens),
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
  const inputTokens = out.usage.input_tokens || 0;
  const outputTokens = out.usage.output_tokens || 0;
  const costCents = computeCostCents(out.model, inputTokens, outputTokens);

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
    sandboxId,
    ephemeral,
    durationMs,
  };
}
