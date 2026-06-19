import type { Route } from "./+types/machine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { getPermanent, releasePermanent } from "~/.server/core/machineOperations";

// GET /api/v2/machines/:id — permanent sandbox by sandboxId (self-healed)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const machine = await getPermanent(ctx, params.id);
  return Response.json(machine);
}

// DELETE /api/v2/machines/:id — release (stops billing + destroys VM), by sandboxId
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const result = await releasePermanent(ctx, params.id);
  return Response.json(result);
}
