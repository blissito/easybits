import type { Route } from "./+types/sites.$id.replay";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { getSite, siteGroupId } from "~/.server/core/siteOperations";
import { shareTurnReplay, unshareTurnReplays } from "~/.server/core/siteTurns.server";

// POST /api/v2/sites/:id/replay {turnId?} — liga pública del replay de un turno del sitio
// («la computadora del agente» reproducida paso a paso). Sin turnId, el último terminado.
// DELETE — deja de compartir: todas las ligas de replay del sitio responden 404.
// Ruta de recurso: sin export default (si no, React Router sirve el shell de la SPA).
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = { user, scopes: ["READ", "WRITE"] } as AuthContext;
  const site = await getSite(ctx, params.id!);
  if (request.method === "DELETE") {
    await unshareTurnReplays(siteGroupId(site.id));
    return Response.json({ ok: true });
  }
  const body = (await request.json().catch(() => ({}))) as { turnId?: string };
  try {
    const token = await shareTurnReplay(siteGroupId(site.id), typeof body.turnId === "string" ? body.turnId : undefined);
    return Response.json({ url: `${new URL(request.url).origin}/replay/${token}` });
  } catch (e) {
    if (e instanceof Response) return Response.json({ error: await e.text() }, { status: e.status });
    throw e;
  }
}
