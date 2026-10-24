import type { Route } from "./+types/sites.engines";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { engineChoicesFor } from "~/.server/core/siteOperations";
import { paginate } from "~/.server/mcp/responses";

// GET /api/v2/sites/engines — los motores con que se puede construir un sitio y el modelo con que
// construye HOY cada uno en esta cuenta (`currentModel`, del builder: vale para todos los sitios de
// ese motor). `needsSecret` = hay que mandar la llave al elegirlo. Ruta de recurso: sin export default.
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const items = (await engineChoicesFor(ctx.user.id)).filter((e) => e.creatable);
  return Response.json(paginate(items, { total: items.length }));
}
