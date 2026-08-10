import type { Route } from "./+types/machine-runspec";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { getRunspec, setRunspec } from "~/.server/core/releaseOperations";

// GET /api/v2/machines/:id/runspec — how this machine's app is built, started
// and backed up. The runspec is what makes the box reproducible.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json({ runspec: await getRunspec(ctx, params.id) });
}

// PUT /api/v2/machines/:id/runspec — merge-and-persist.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT" && request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const body = await request.json();
  return Response.json(await setRunspec(ctx, params.id, body));
}
