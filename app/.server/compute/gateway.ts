// eb.compute — gateway OpenAI-compatible para LLM managed dentro de sandboxes.
//
// El código dentro de un sandbox apunta su cliente OpenAI a este endpoint
// (OPENAI_BASE_URL inyectado) con una ComputeKey como api_key. El gateway:
//   1. autentica la ComputeKey → { userId, sandboxId }
//   2. traduce el request OpenAI Chat Completions → Vercel AI SDK v6
//   3. reenvía al proveedor real (Gemini/OpenAI/Anthropic) con keys de plataforma
//   4. traduce la respuesta de vuelta a formato OpenAI (stream o no)
//   5. mide tokens reales y cobra créditos vía incrementAiGeneration
//
// Spec de cable: OpenAI Chat Completions (la lingua franca — vLLM, Groq,
// OpenRouter, etc. la exponen). Patrón de cobro: AI Gateway (LiteLLM/OpenRouter).
import { randomBytes } from "node:crypto";
import {
  streamText,
  generateText,
  jsonSchema,
  tool,
  type ModelMessage,
} from "ai";
import { db } from "../db";
import { resolveModelLocal } from "../aiModels";
import { incrementAiGeneration } from "../aiGenerationLimit";
import {
  COMPUTE_DEFAULTS,
  computeCreditsForTokens,
  type ComputeConfig,
} from "~/lib/credits";

// URL pública del gateway, horneada en OPENAI_BASE_URL de cada sandbox.
// Default path-based (funciona ya, sin infra). Cuando exista el subdominio
// compute.easybits.cloud, override con COMPUTE_BASE_URL sin tocar código.
export const COMPUTE_BASE_URL =
  process.env.COMPUTE_BASE_URL ||
  `${process.env.BASE_URL || "https://www.easybits.cloud"}/api/v2/compute/v1`;

const KEY_PREFIX = "sk-eb-";

// ─────────────── config (AppConfig, no envs) ───────────────

let cfgCache: ComputeConfig | null = null;
let cfgTime = 0;
const CFG_TTL = 60_000;

// Resuelve config desde AppConfig key "compute-config" mergeada sobre los
// defaults (mismo patrón que ai-models en aiModels.ts). Tuneable en vivo,
// sin redeploy, leída igual por todas las instancias del app.
export async function getComputeConfig(): Promise<ComputeConfig> {
  const now = Date.now();
  if (cfgCache && now - cfgTime < CFG_TTL) return cfgCache;
  let override: Partial<ComputeConfig> = {};
  try {
    const row = await db.appConfig.findUnique({
      where: { key: "compute-config" },
    });
    if (row?.value) override = row.value as Partial<ComputeConfig>;
  } catch {
    // DB caída → defaults
  }
  cfgCache = {
    ...COMPUTE_DEFAULTS,
    ...override,
    models: { ...COMPUTE_DEFAULTS.models, ...(override.models ?? {}) },
    rates: { ...COMPUTE_DEFAULTS.rates, ...(override.rates ?? {}) },
  };
  cfgTime = now;
  return cfgCache;
}

// Modelos con visión = derivado: todos los del rate table soportan imágenes hoy.
function isVisionModel(internalId: string): boolean {
  return /^(gemini-|gpt-4o|claude-)/.test(internalId);
}

// ─────────────── ComputeKey: mint / verify / revoke ───────────────

export async function mintComputeKey(
  userId: string,
  sandboxId: string,
): Promise<string> {
  const cfg = await getComputeConfig();
  const token = KEY_PREFIX + randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + cfg.keyTtlHours * 3600 * 1000);
  await db.computeKey.create({ data: { token, userId, sandboxId, expiresAt } });
  return token;
}

export async function verifyComputeKey(
  raw: string | null | undefined,
): Promise<{ userId: string; sandboxId: string } | null> {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;
  try {
    const row = await db.computeKey.findUnique({ where: { token: raw } });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return { userId: row.userId, sandboxId: row.sandboxId };
  } catch {
    return null;
  }
}

// Revoca todas las keys de un sandbox (llamado al destroySandbox).
export async function revokeSandboxKeys(sandboxId: string): Promise<void> {
  await db.computeKey.deleteMany({ where: { sandboxId } }).catch(() => {});
}

// ─────────────── OpenAI ↔ AI SDK translation ───────────────

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

// Traduce mensajes OpenAI → ModelMessage[] del AI SDK v6. Reconstruye el
// historial de tool-calling: asistente con tool_calls + role:"tool" con
// resultados. `toolNameById` resuelve el toolName que OpenAI no manda en el
// mensaje tool (solo trae tool_call_id).
function toModelMessages(messages: OAIMessage[]): ModelMessage[] {
  const toolNameById = new Map<string, string>();
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      out.push({ role: "system", content: asText(m.content) });
    } else if (m.role === "user") {
      out.push({ role: "user", content: toUserContent(m.content) } as ModelMessage);
    } else if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          toolNameById.set(tc.id, tc.function.name);
        }
        out.push({
          role: "assistant",
          content: m.tool_calls.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: safeParse(tc.function.arguments),
          })),
        } as ModelMessage);
      } else {
        out.push({ role: "assistant", content: asText(m.content) });
      }
    } else if (m.role === "tool") {
      const toolCallId = m.tool_call_id ?? "";
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId,
            toolName: toolNameById.get(toolCallId) ?? "tool",
            output: { type: "text" as const, value: asText(m.content) },
          },
        ],
      } as ModelMessage);
    }
  }
  return out;
}

function asText(content: OAIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
  return "";
}

function toUserContent(content: OAIMessage["content"]) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) =>
    p.type === "image_url"
      ? { type: "image" as const, image: p.image_url.url }
      : { type: "text" as const, text: p.text },
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

interface OAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

function toSdkTools(tools?: OAITool[]) {
  if (!tools?.length) return undefined;
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const t of tools) {
    if (t.type !== "function") continue;
    out[t.function.name] = tool({
      description: t.function.description,
      // passthrough: sin execute → el SDK devuelve los toolCalls y para; el
      // cliente (dentro del sandbox) los ejecuta y manda los resultados.
      inputSchema: jsonSchema((t.function.parameters as object) ?? { type: "object" }),
    });
  }
  return out;
}

function toSdkToolChoice(tc: unknown) {
  if (tc === "auto" || tc === "none" || tc === "required") return tc;
  if (tc && typeof tc === "object" && (tc as any).type === "function") {
    return { type: "tool" as const, toolName: (tc as any).function?.name };
  }
  return undefined;
}

// ─────────────── request handler ───────────────

interface ChatBody {
  model?: string;
  messages?: OAIMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: OAITool[];
  tool_choice?: unknown;
}

function openaiError(status: number, message: string, type: string): Response {
  return Response.json({ error: { message, type } }, { status });
}

export async function handleChatCompletion(
  request: Request,
  key: { userId: string; sandboxId: string },
): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return openaiError(400, "Invalid JSON body", "invalid_request_error");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return openaiError(400, "`messages` is required", "invalid_request_error");
  }

  const cfg = await getComputeConfig();
  const friendly = body.model || cfg.defaultModel;
  const internalId = cfg.models[friendly] || cfg.models[cfg.defaultModel];
  if (!internalId) {
    return openaiError(
      400,
      `Unknown model "${friendly}". Allowed: ${Object.keys(cfg.models).join(", ")}`,
      "invalid_request_error",
    );
  }

  const hasImage = body.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"),
  );
  if (hasImage && !isVisionModel(internalId)) {
    return openaiError(
      400,
      `Model "${friendly}" does not support image input`,
      "invalid_request_error",
    );
  }

  const model = resolveModelLocal(internalId);
  const messages = toModelMessages(body.messages);
  const tools = toSdkTools(body.tools);
  const common = {
    model,
    messages,
    ...(tools ? { tools, toolChoice: toSdkToolChoice(body.tool_choice) } : {}),
    temperature: body.temperature,
    maxOutputTokens: body.max_tokens,
    topP: body.top_p,
    stopSequences: typeof body.stop === "string" ? [body.stop] : body.stop,
    abortSignal: request.signal,
  } as const;

  const id = "chatcmpl-" + randomBytes(12).toString("hex");
  const created = Math.floor(Date.now() / 1000);

  // Cobra créditos por tokens reales. Best-effort fire-and-forget para no
  // bloquear la respuesta; el balance se reconcilia en incrementAiGeneration.
  const meter = (inTok: number, outTok: number, durationMs: number): number => {
    const credits = computeCreditsForTokens(cfg, internalId, inTok, outTok);
    void incrementAiGeneration(key.userId, undefined, {
      type: "compute.chat",
      product: "compute",
      cost: credits,
      modelId: internalId,
      inputTokens: inTok,
      outputTokens: outTok,
      resourceId: key.sandboxId,
      durationMs,
    });
    return credits;
  };

  const started = Date.now();

  // ─── streaming ───
  if (body.stream) {
    const result = streamText(common as any);
    const includeUsage = body.stream_options?.include_usage === true;
    const encoder = new TextEncoder();

    const sse = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // cliente desconectado — seguimos para medir tokens igual
          }
        };
        const chunk = (delta: unknown, finish: string | null = null) => ({
          id,
          object: "chat.completion.chunk",
          created,
          model: friendly,
          choices: [{ index: 0, delta, finish_reason: finish }],
        });

        try {
          send(chunk({ role: "assistant" }));
          for await (const delta of result.textStream) {
            if (delta) send(chunk({ content: delta }));
          }
          // tool_calls completos (no deltas troceados) al cierre.
          const toolCalls = await Promise.resolve(result.toolCalls).catch(
            () => [] as any[],
          );
          if (Array.isArray(toolCalls) && toolCalls.length) {
            send(
              chunk({
                tool_calls: toolCalls.map((tc: any, index: number) => ({
                  index,
                  id: tc.toolCallId,
                  type: "function",
                  function: {
                    name: tc.toolName,
                    arguments: JSON.stringify(tc.input ?? {}),
                  },
                })),
              }),
            );
            send(chunk({}, "tool_calls"));
          } else {
            send(chunk({}, "stop"));
          }
        } catch {
          send(chunk({}, "stop"));
        } finally {
          // medir SIEMPRE — incluso si el cliente abortó a media respuesta.
          const usage = await Promise.resolve(result.usage).catch(() => null);
          const inTok = usage?.inputTokens ?? 0;
          const outTok = usage?.outputTokens ?? 0;
          const credits = meter(inTok, outTok, Date.now() - started);
          if (includeUsage) {
            send({
              id,
              object: "chat.completion.chunk",
              created,
              model: friendly,
              choices: [],
              usage: {
                prompt_tokens: inTok,
                completion_tokens: outTok,
                total_tokens: inTok + outTok,
                cost: credits,
              },
            });
          }
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            /* cliente ido */
          }
          controller.close();
        }
      },
    });

    return new Response(sse, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ─── no-streaming ───
  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    result = await generateText(common as any);
  } catch (e) {
    return openaiError(
      502,
      `Upstream provider error: ${e instanceof Error ? e.message : String(e)}`,
      "upstream_error",
    );
  }
  const inTok = result.usage?.inputTokens ?? 0;
  const outTok = result.usage?.outputTokens ?? 0;
  const credits = meter(inTok, outTok, Date.now() - started);

  const toolCalls = result.toolCalls ?? [];
  const message: Record<string, unknown> =
    toolCalls.length > 0
      ? {
          role: "assistant",
          content: result.text || null,
          tool_calls: toolCalls.map((tc: any) => ({
            id: tc.toolCallId,
            type: "function",
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.input ?? {}),
            },
          })),
        }
      : { role: "assistant", content: result.text };

  return Response.json({
    id,
    object: "chat.completion",
    created,
    model: friendly,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: inTok,
      completion_tokens: outTok,
      total_tokens: inTok + outTok,
      cost: credits,
    },
  });
}
