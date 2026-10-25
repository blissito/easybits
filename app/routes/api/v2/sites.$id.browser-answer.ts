import type { Route } from "./+types/sites.$id.browser-answer";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { getSite, siteGroupId } from "~/.server/core/siteOperations";
import { answerHumanAsk } from "~/.server/core/browserHandoff";

// POST /api/v2/sites/:id/browser-answer {sessionId, answer: "delegate" | "cancel"} — «Hazlo tú» y
// «Cancelar» de la tarjeta «Te necesito aquí»: contestan el pedido de ayuda sin tomar el control
// y el agente sigue en el mismo turno. 410 {gone} = el agente ya no esperaba (la tarjeta se
// cierra). Ruta de recurso: sin export default.
export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const site = await getSite({ user, scopes: ["READ", "WRITE"] } as AuthContext, params.id!);
  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown; answer?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const answer = body.answer === "delegate" || body.answer === "cancel" ? body.answer : null;
  if (!sessionId || !answer) return Response.json({ error: "sessionId y answer (delegate|cancel)" }, { status: 400 });
  if (!answerHumanAsk(siteGroupId(site.id), sessionId, { answered: answer })) return Response.json({ gone: true }, { status: 410 });
  return Response.json({ ok: true });
}
