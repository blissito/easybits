import type { Route } from "./+types/sandbox-bg-detail";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  execBackgroundStatus,
  execBackgroundKill,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes/:id/bg/:execId — status + captured logs
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(
    await execBackgroundStatus(ctx, params.id, params.execId)
  );
}

// DELETE /api/v2/sandboxes/:id/bg/:execId — kill the background process
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await execBackgroundKill(ctx, params.id, params.execId));
}
