import type { Route } from "./+types/calls.$id.list";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listStudioRecordings } from "~/.server/core/studioOperations";

// GET /api/v2/calls/:id/list  → [{ file, url, size, modifiedAt }]
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listStudioRecordings(ctx, params.id);
  return Response.json(result);
}
