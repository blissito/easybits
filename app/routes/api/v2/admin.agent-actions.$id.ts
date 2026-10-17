import type { Route } from "./+types/admin.agent-actions.$id";
import { requireAdminSession } from "~/.server/core/adminCopilot";
import { resolveAgentAction } from "~/.server/core/agentActions";

// POST /api/v2/admin/agent-actions/:id  { decision: "approve" | "reject" }
// Aprueba (y ejecuta UNA vez) o rechaza lo que propuso el copiloto (run_cron / pause_cron).
// Sólo con la SESIÓN del superusuario dueño de la propuesta: cualquier Bearer se rechaza.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = await requireAdminSession(request);
  const body = (await request.json().catch(() => ({}))) as { decision?: unknown };
  if (body.decision !== "approve" && body.decision !== "reject") {
    return Response.json({ error: "decision debe ser approve o reject" }, { status: 400 });
  }
  const out = await resolveAgentAction({ id: ctx.user.id, email: ctx.user.email }, params.id!, body.decision);
  if (out.status === "not_pending") {
    return Response.json(
      {
        error: "not_pending",
        status: out.current,
        message: out.current === "not_found" ? "No se encontró la acción." : "Esta acción ya se había resuelto o venció.",
      },
      { status: out.current === "not_found" ? 404 : 409 }
    );
  }
  if (out.status === "failed") return Response.json({ error: out.error, status: "failed" }, { status: 422 });
  return Response.json(out);
}
