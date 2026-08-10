import type { Route } from "./+types/machine-release-redeploy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { recreateFromRelease } from "~/.server/core/releaseOperations";

// POST /api/v2/machine-releases/:id/redeploy — build a BRAND NEW machine from a
// release. Its own collection, not nested under a machine: the whole point is
// that it works when the original machine no longer exists. Also the resize
// path (pass a different tier + replaceSandboxId).
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  return Response.json(await recreateFromRelease(ctx, { ...body, releaseId: params.id }));
}
