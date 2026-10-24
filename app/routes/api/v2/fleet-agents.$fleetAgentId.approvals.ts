import type { Route } from "./+types/fleet-agents.$fleetAgentId.approvals";
import { db } from "~/.server/db";
import { authenticateRequest } from "~/.server/apiAuth";
import { getUserOrNull } from "~/.server/getters";
import { listFleetApprovals } from "~/.server/core/fleetApprovals";

// GET /api/v2/fleet-agents/:fleetAgentId/approvals?status=awaiting&groupId= — las aprobaciones
// del agente (sesión del dueño o su API key: VER es inofensivo; decidir no se hace con llave, ver
// fleet-agents.approvals.$approvalId.$decision.ts). Ruta de recurso: sin export default.
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = (await getUserOrNull(request).catch(() => null)) ?? (await authenticateRequest(request).catch(() => null))?.user ?? null;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const agent = await db.fleetAgent.findFirst({ where: { id: params.fleetAgentId!, ownerId: user.id }, select: { id: true } });
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  const u = new URL(request.url);
  const status = u.searchParams.get("status") ?? "awaiting";
  if (!["awaiting", "approved", "denied", "used"].includes(status)) return Response.json({ error: "bad status" }, { status: 400 });
  const items = await listFleetApprovals(user.id, { fleetAgentId: agent.id, groupId: u.searchParams.get("groupId") ?? undefined, status });
  return Response.json({ items, nextCursor: null, hasMore: false, total: items.length });
}
