import type { Route } from "./+types/cron";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { deleteUserCron, getUserCron, updateUserCron } from "~/.server/core/userCronOperations";

// GET /api/v2/crons/:id
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await getUserCron(ctx, params.id!));
}

// PATCH/DELETE /api/v2/crons/:id
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    return Response.json(await updateUserCron(ctx, params.id!, body));
  }
  if (request.method === "DELETE") return Response.json(await deleteUserCron(ctx, params.id!));
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
