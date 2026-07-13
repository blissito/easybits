import type { Route } from "./+types/fleet-agents.$fleetAgentId.connect";
import { authFleetAgentManage } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { connectFleetAgent, disconnectFleetAgent } from "~/.server/integrations/whatsapp/baileys.server";

// GET  /api/v2/fleet-agents/:fleetAgentId/connect → current Baileys state (poll for QR/status)
// POST /api/v2/fleet-agents/:fleetAgentId/connect → start the socket (lazy init); ?disconnect=1 to stop
// Auth = dueño, delegado (scope agents) o el fleetAgent.token (ver authFleetAgentManage).
const ownPool = (request: Request, fleetAgentId: string) => authFleetAgentManage(request, fleetAgentId);

export async function loader({ request, params }: Route.LoaderArgs) {
  const fleetAgent = await ownPool(request, params.fleetAgentId!);
  return Response.json({ baileys: fleetAgent.baileys ?? { status: "disconnected" } });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgent = await ownPool(request, params.fleetAgentId!);
  const url = new URL(request.url);
  if (url.searchParams.get("disconnect")) {
    await disconnectFleetAgent(fleetAgent.id);
    return Response.json({ ok: true, status: "disconnected" });
  }
  await connectFleetAgent(fleetAgent.id);
  const fresh = await db.fleetAgent.findUnique({ where: { id: fleetAgent.id } });
  return Response.json({ ok: true, baileys: fresh?.baileys ?? { status: "connecting" } });
}
