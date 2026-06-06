// POST /api/v2/compute/v1/chat/completions
// Endpoint OpenAI-compatible de eb.compute. Dos formas de auth:
//   1. ComputeKey (sk-eb-…) — inyectada dentro de un sandbox (zero-config).
//   2. API key normal de EasyBits — para llamar al LLM managed desde TU app,
//      sin sandbox. En ambos casos se cobra por token contra tus créditos.
import type { Route } from "./+types/compute-chat";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { verifyComputeKey, handleChatCompletion } from "~/.server/compute/gateway";

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function oaiError(status: number, message: string, type: string) {
  return Response.json({ error: { message, type } }, { status });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return oaiError(405, "Method not allowed", "invalid_request_error");
  }

  // sk-eb-… → ComputeKey (desde un sandbox). Cualquier otra → API key de
  // EasyBits (desde tu app/SDK), resuelta por el auth normal.
  let key = await verifyComputeKey(bearer(request));
  if (!key) {
    try {
      const ctx = requireAuth(await authenticateRequest(request));
      key = { userId: ctx.user.id, sandboxId: "sdk" };
    } catch {
      return oaiError(401, "Invalid credentials", "invalid_api_key");
    }
  }

  const limited = await applySandboxRateLimit(key.userId, "op");
  if (limited) return limited;

  // Pre-check de créditos ANTES de reenviar al proveedor (no quemar inference
  // si el usuario está en cero). El cobro real es por tokens, post-ejecución.
  const lim = await checkAiGenerationLimit(key.userId);
  const available =
    (lim.limit === null ? Infinity : Math.max(0, lim.limit - lim.used)) +
    (lim.bonus ?? 0);
  if (available < 1) {
    return oaiError(402, "Insufficient credits", "insufficient_quota");
  }

  return handleChatCompletion(request, key);
}
