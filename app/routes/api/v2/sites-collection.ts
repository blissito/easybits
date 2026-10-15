import type { Route } from "./+types/sites-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listSiteSummaries } from "~/.server/core/siteOperations";
import { paginate } from "~/.server/mcp/responses";

// GET /api/v2/sites — los sitios de /dash/sitios (estáticos y web apps, con su motor).
// Ruta de recurso: sólo loader, sin export default (si no, sirve el shell de la SPA).
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const items = await listSiteSummaries(ctx);
  return Response.json(paginate(items, { total: items.length }));
}
