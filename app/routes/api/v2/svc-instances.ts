import type { Route } from "./+types/svc-instances";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listSvcInstances } from "~/.server/core/sandboxOperations";

// GET /api/v2/svc-instances
// Servicios "dumb" del tenant que están corriendo (owner-scoped). Para que el
// catálogo de ghosty.studio sepa cuáles ya están en la flota.
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const instances = await listSvcInstances(ctx);
  return Response.json({ instances });
}
