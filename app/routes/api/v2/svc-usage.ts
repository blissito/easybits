import type { Route } from "./+types/svc-usage";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listSvcUsage } from "~/.server/core/sandboxOperations";

// GET /api/v2/svc-usage?svc=
// Trazas del service-mesh (agente→servicio), owner-scoped. Para el panel de
// uso en ghosty.studio. Owner-auth (no embedTokens).
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const svc = url.searchParams.get("svc") ?? undefined;
  const usage = await listSvcUsage(ctx, svc ? { svc } : {});
  return Response.json({ usage });
}
