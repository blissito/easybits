import type { Route } from "./+types/calls.$id.status";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getCallStatus } from "~/.server/core/studioOperations";

// GET /api/v2/calls/:id/status
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getCallStatus(ctx, params.id);
  return Response.json(result);
}
