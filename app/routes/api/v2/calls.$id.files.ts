import type { Route } from "./+types/calls.$id.files";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listCallFiles } from "~/.server/core/studioOperations";

// GET /api/v2/calls/files
// (el :id no se usa — lista todos los files de studio del usuario)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listCallFiles(ctx);
  return Response.json(result);
}
