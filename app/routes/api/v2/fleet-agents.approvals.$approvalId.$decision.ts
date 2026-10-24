import type { Route } from "./+types/fleet-agents.approvals.$approvalId.$decision";
import { getUserOrNull } from "~/.server/getters";
import { ApprovalError, resolveFleetApproval, verifyDecisionSig, type ApprovalDecision } from "~/.server/core/fleetApprovals";

// POST /api/v2/fleet-agents/approvals/:approvalId/(approve|deny) — decide una aprobación de la
// flota. Dos formas, y ninguna es una llave que la caja del agente pueda ver:
//   1. La sesión del dueño (Sitios, el panel).
//   2. `?sig=` firmado de un solo uso, que viaja en el webhook `agent.approval_requested` a la
//      superficie del cliente (Ghosty Studio, Teams, Denik), que lo llama tras decidir su humano.
// Ruta de recurso: sin export default.
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const decision = params.decision as ApprovalDecision;
  if (decision !== "approve" && decision !== "deny") return Response.json({ error: "Not found" }, { status: 404 });
  const id = params.approvalId!;
  const sig = new URL(request.url).searchParams.get("sig");
  try {
    if (sig) {
      if (!verifyDecisionSig(id, decision, sig)) return Response.json({ error: "Firma inválida" }, { status: 403 });
      return Response.json(await resolveFleetApproval(id, decision, { resolvedBy: "signed-link" }));
    }
    const user = await getUserOrNull(request).catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await resolveFleetApproval(id, decision, { ownerId: user.id, resolvedBy: user.email ?? user.id }));
  } catch (e) {
    if (e instanceof ApprovalError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
