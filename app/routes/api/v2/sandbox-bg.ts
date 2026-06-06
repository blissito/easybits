import type { Route } from "./+types/sandbox-bg";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { execBackground } from "~/.server/core/sandboxOperations";
import { computeEnvFor } from "~/.server/compute/gateway";

// POST /api/v2/sandboxes/:id/bg — start a background command → { execId }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  if (!body.command)
    return Response.json({ error: "command required" }, { status: 400 });
  // eb.compute: inyecta OPENAI_API_KEY/BASE_URL para que el proceso pueda
  // llamar al LLM managed sin key propia (zero-config). BYOK gana.
  const env = { ...(body.env ?? {}) };
  if (!env.OPENAI_API_KEY) {
    Object.assign(env, await computeEnvFor(ctx.user.id, params.id).catch(() => ({})));
  }
  return Response.json(
    await execBackground(ctx, params.id, {
      command: body.command,
      cwd: body.cwd,
      env,
    })
  );
}
