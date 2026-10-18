import type { Route } from "./+types/cron-run";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { runUserCronNow } from "~/.server/core/userCronOperations";

// POST /api/v2/crons/:id/run — ejecutar ahora (segundo plano; el resultado sale en /runs)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  return Response.json(await runUserCronNow(ctx, params.id!), { status: 202 });
}
