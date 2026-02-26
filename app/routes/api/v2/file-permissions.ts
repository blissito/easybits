import type { Route } from "./+types/file-permissions";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listPermissions } from "~/.server/core/operations";

// GET /api/v2/files/:fileId/permissions
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listPermissions(ctx, params.fileId!);
  return Response.json(result);
}
