import type { Route } from "./+types/llm-proxy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getSecretValue } from "~/.server/core/secretOperations";
import { checkLLMTokenLimit, formatTokens } from "~/.server/llmTokenLimit";
import { bill } from "~/.server/llmProxyBilling";
import { RateLimiter } from "~/.server/rateLimiter";

// ─── LLM Proxy — OpenAI-compatible → DeepSeek ─────────────────────────────
// POST /api/v2/llm/v1/chat/completions
//
// Body 100% compatible con DeepSeek API. Response 100% transparente.
// El proxy usa la DEEPSEEK_API_KEY de EasyBits (no del usuario).
// Cobro de tokens contra el plan + recargas del usuario.
// ───────────────────────────────────────────────────────────────────────────

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const PROXY_TIMEOUT_MS = 300_000;

const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 30 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json(
    { error: { message: "Method not allowed", type: "invalid_request_error" } },
    { status: 405, headers: CORS },
  );
}

export async function action({ request }: Route.ActionArgs) {
  // ── Auth ──────────────────────────────────────────────────────────────
  let userId: string;
  try {
    userId = requireAuth(await authenticateRequest(request)).user.id;
  } catch {
    return Response.json(
      { error: { message: "Invalid API key. Use your EasyBits key (eb_sk_live_...).", type: "invalid_api_key" } },
      { status: 401, headers: CORS },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────
  const { allowed, remaining, resetTime } = await rl.checkRateLimit(userId);
  if (!allowed) {
    const retry = Math.ceil((resetTime - Date.now()) / 1000);
    return Response.json(
      { error: { message: `Rate limit. Retry in ${retry}s.`, type: "rate_limit_exceeded" } },
      { status: 429, headers: { ...CORS, "Retry-After": String(retry), "x-ratelimit-remaining-requests": "0" } },
    );
  }

  // ── DeepSeek key: plataforma (env) o BYOK (secrets del usuario) ──────
  const deepseekKey =
    process.env.DEEPSEEK_API_KEY ||
    (await getSecretValue(userId, "DEEPSEEK_API_KEY").catch(() => null));
  if (!deepseekKey) {
    return Response.json(
      { error: { message: "EasyBits DeepSeek key not configured.", type: "invalid_api_key" } },
      { status: 402, headers: CORS },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: any;
  try { body = await request.json(); } catch {
    return Response.json({ error: { message: "Invalid JSON", type: "invalid_request_error" } }, { status: 400, headers: CORS });
  }

  const model = body.model || "deepseek-chat";
  const isStream = body.stream === true;

  // ── Token budget ──────────────────────────────────────────────────────
  const budget = await checkLLMTokenLimit(userId);
  if (!budget.allowed) {
    return Response.json(
      {
        error: {
          message: `LLM token quota exhausted. Used: ${formatTokens(budget.used)}, Limit: ${formatTokens(budget.limit)}. Upgrade your plan or recharge.`,
          type: "insufficient_quota",
          meta: { used: budget.used, limit: budget.limit, remaining: 0, reset_at: budget.resetAt },
        },
      },
      { status: 402, headers: CORS },
    );
  }

  // ── Forward a DeepSeek ─────────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        ...body,
        model,
        stream: isStream,
        ...(isStream ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return Response.json(err, { status: upstream.status, headers: CORS });
    }

    // ── Streaming ───────────────────────────────────────────────────────
    if (isStream && upstream.body) {
      return streaming(upstream.body, userId, model, remaining);
    }

    // ── Non-streaming ───────────────────────────────────────────────────
    const data = await upstream.json();
    bill(data, userId, model);
    return Response.json(
      { ...data, model, proxy: "easybits.cloud" },
      { headers: { ...CORS, "x-ratelimit-remaining-requests": String(remaining), "x-llm-tokens-remaining": String(budget.remaining) } },
    );
  } catch (err: any) {
    clearTimeout(timer);
    const status = err.name === "AbortError" ? 504 : 502;
    return Response.json({ error: { message: err.name === "AbortError" ? "Upstream timeout" : "Proxy error", type: "proxy_error" } }, { status, headers: CORS });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Streaming pipe + billing on close ────────────────────────────────────

function streaming(body: ReadableStream<Uint8Array>, userId: string, model: string, remaining: number): Response {
  const decoder = new TextDecoder();
  let last = "";

  const tee = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      ctrl.enqueue(chunk);
      for (const line of decoder.decode(chunk, { stream: true }).split("\n")) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") last = line.slice(6);
      }
    },
    flush() {
      try { const p = JSON.parse(last); if (p?.usage) bill({ usage: p.usage }, userId, model); } catch {}
    },
  });

  return new Response(body.pipeThrough(tee), {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-ratelimit-remaining-requests": String(remaining),
    },
  });
}
