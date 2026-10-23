import type { Route } from "./+types/sites.$id.watch";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { getSite, siteGroupId } from "~/.server/core/siteOperations";
import { liveBrowserSession } from "~/.server/core/siteTurns.server";
import { watchPass } from "~/.server/core/renderClient";

// POST /api/v2/sites/:id/watch {sessionId} — ver en vivo el navegador del agente sin quitarle
// el mando. Misma regla que takeover: sólo una sesión del turno EN CURSO de este sitio. Devuelve
// la URL de la pestaña con un pase firmado de sólo mirar (proxy en sites.$id.takeover.$pass.$op).
// Ruta de recurso: sin export default.
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const site = await getSite({ user, scopes: ["READ", "WRITE"] } as AuthContext, params.id!);
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const turn = sessionId ? liveBrowserSession(siteGroupId(site.id), sessionId) : null;
  if (!turn) return Response.json({ error: "Ese navegador ya no está en un turno en curso" }, { status: 404 });
  // La caja de render es del dueño del agente (no necesariamente del dueño del sitio).
  const agent = await db.fleetAgent.findUnique({ where: { id: turn.fleetAgentId }, select: { ownerId: true } });
  if (!agent) return Response.json({ error: "Agente no encontrado" }, { status: 404 });
  return Response.json(watchPass(agent.ownerId, sessionId, site.id));
}
