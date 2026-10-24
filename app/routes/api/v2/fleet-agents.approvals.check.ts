import type { Route } from "./+types/fleet-agents.approvals.check";
import { db } from "~/.server/db";
import { checkToolApproval } from "~/.server/core/fleetApprovals";

// POST /api/v2/fleet-agents/approvals/check {sessionId, tool, input} — lo llama el worker (hook
// PreToolUse) cuando una regla del agente marca la tool `ask`. Auth = el FLEET_TOKEN del worker;
// la sesión del turno ubica la conversación (mismo patrón que wa-action). Responde
// `allow` (había aprobación para esa llamada exacta), `ask` (pendiente) o `deny` (la negaron).
// Ruta de recurso: sin export default.
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!bearer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown; tool?: unknown; input?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const tool = typeof body.tool === "string" ? body.tool.slice(0, 200) : "";
  if (!sessionId || !tool) return Response.json({ error: "sessionId and tool required" }, { status: 400 });

  const { validateFleetToken, isFleetToken } = await import("~/.server/core/fleetTokens");
  let fleetAgentId: string | null = null;
  if (isFleetToken(bearer)) fleetAgentId = (await validateFleetToken(bearer))?.fleetAgentId ?? null;
  else {
    const legacy = await db.fleetAgent.findFirst({ where: { token: bearer }, select: { id: true, legacyTokenMode: true } });
    fleetAgentId = legacy && legacy.legacyTokenMode !== "deny" ? legacy.id : null;
  }
  if (!fleetAgentId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const route = await db.fleetAgentRoute.findFirst({
    where: { sessionUuid: sessionId, fleetAgentId },
    select: { groupId: true, fleetAgent: { select: { ownerId: true } } },
  });
  if (!route) return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(await checkToolApproval({ fleetAgentId, ownerId: route.fleetAgent.ownerId, groupId: route.groupId, tool, input: body.input ?? {} }));
}
