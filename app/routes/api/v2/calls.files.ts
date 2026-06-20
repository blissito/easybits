import type { Route } from "./+types/calls.files";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listCallFiles } from "~/.server/core/studioOperations";

// GET /api/v2/calls/files
// Lista todas las grabaciones permanentes en Files del usuario (fuente: studio).
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listCallFiles(ctx);
  return Response.json(result);
}
