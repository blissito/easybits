import type { Route } from "./+types/sites.$id.takeover";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { getSite, siteGroupId } from "~/.server/core/siteOperations";
import { liveBrowserSession } from "~/.server/core/siteTurns.server";
import { panelViewportOf, takeoverOnBox } from "~/.server/core/renderClient";
import { holdHandoff } from "~/.server/core/browserHandoff";

// POST /api/v2/sites/:id/takeover {sessionId, viewport?} — «Tomar el control» del navegador del agente.
// Sólo una sesión que aparece en el turno EN CURSO de este sitio. Devuelve URLs de EasyBits
// (pestaña en vivo + clics/teclas) con un pase firmado; la caja nunca llega al navegador
// (proxy en sites.$id.takeover.$op.ts). Ruta de recurso: sin export default.
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const site = await getSite({ user, scopes: ["READ", "WRITE"] } as AuthContext, params.id!);
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; viewport?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const turn = sessionId ? liveBrowserSession(siteGroupId(site.id), sessionId) : null;
  if (!turn) return Response.json({ error: "Ese navegador ya no está en un turno en curso" }, { status: 404 });
  // La caja de render es del dueño del agente (no necesariamente del dueño del sitio).
  const agent = await db.fleetAgent.findUnique({ where: { id: turn.fleetAgentId }, select: { ownerId: true } });
  const owner = agent && (await db.user.findUnique({ where: { id: agent.ownerId } }));
  if (!owner) return Response.json({ error: "Agente no encontrado" }, { status: 404 });
  try {
    const urls = await takeoverOnBox({ user: owner, scopes: ["READ", "WRITE"] } as AuthContext, sessionId, site.id, panelViewportOf(body.viewport));
    // Con la persona al mando, browser_close no le cierra el navegador.
    holdHandoff(sessionId, urls.expiresInMs);
    return Response.json(urls);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
