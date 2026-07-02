import type { Route } from "./+types/workspace-usage";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getWorkspaceUsage } from "~/.server/core/operations";

// GET /api/v2/workspaces/:workspaceId/usage
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const usage = await getWorkspaceUsage(ctx, params.workspaceId!);
  return Response.json(usage);
}
