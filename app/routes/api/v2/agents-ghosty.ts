import type { Route } from "./+types/agents-ghosty";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { spawnGhosty } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/ghosty
// Zero-config: spawns the brand-default Ghosty agent using EasyBits' managed
// Anthropic credentials (SANDBOX_HOST_ANTHROPIC_KEY). Caller passes nothing
// required — optional name + systemPrompt overrides only.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "create"
  );
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const result = await spawnGhosty(ctx, {
    name: typeof body?.name === "string" ? body.name : undefined,
    systemPrompt: typeof body?.systemPrompt === "string" ? body.systemPrompt : undefined,
    timeoutSeconds: typeof body?.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
  });
  return Response.json(result);
}
