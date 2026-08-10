import type { Route } from "./+types/machine-rollback";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { applyRelease } from "~/.server/core/releaseOperations";

// POST /api/v2/machines/:id/rollback { releaseId } — put a previous release back
// on the SAME machine (unpack + rebuild + restart). Data is untouched.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const body = await request.json();
  if (!body?.releaseId) {
    return Response.json({ error: "releaseId is required" }, { status: 400 });
  }
  return Response.json(await applyRelease(ctx, params.id, body.releaseId));
}
