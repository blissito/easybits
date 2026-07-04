import { db } from "~/.server/db";
import { deleteFleetAgent } from "~/.server/core/fleetAgentOperations";
import type { AuthContext } from "~/.server/apiAuth";

// POST /api/v2/fleet-agents/:fleetAgentId/delete
//
// Teardown de un FleetAgent (VMs + memoria + row) vía deleteFleetAgent, actuando
// como el owner. Auth = fleetAgent.token (owner-trusted bearer, mismo patrón que
// /waba/config). Lo usa Formmy al desconectar un agente de la flota, para no dejar
// FleetAgents huérfanos. Idempotente: si el fleet ya no existe → 404 (el caller lo
// trata como ya-borrado).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { fleetAgentId?: string };
}) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  const fleetAgentId = params.fleetAgentId ?? "";
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent) {
    // Ya no existe → borrado idempotente.
    return Response.json({ ok: true, alreadyGone: true }, { headers: CORS });
  }
  if (!bearer || fleetAgent.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const owner = await db.user.findUnique({ where: { id: fleetAgent.ownerId } });
  if (!owner) {
    return Response.json({ error: "owner not found" }, { status: 404, headers: CORS });
  }

  try {
    const ctx = { user: owner, scopes: ["READ", "WRITE", "DELETE"] } as unknown as AuthContext;
    await deleteFleetAgent(ctx, fleetAgentId);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete failed" },
      { status: 500, headers: CORS },
    );
  }
  return Response.json({ ok: true }, { headers: CORS });
}
