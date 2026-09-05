import type { Route } from "./+types/fleet-agents.$fleetAgentId.tokens";
import { authFleetAgent } from "~/.server/apiAuth";
import {
  createFleetToken,
  listFleetTokens,
  revokeFleetToken,
} from "~/.server/core/fleetTokens";
import type { FleetTokenScope } from "@prisma/client";

// Gestión de credenciales CON SCOPE de un FleetAgent.
//
//   GET    → { tokens }            (auth ADMIN)
//   POST   { name, scopes[], publishable?, cfgId?, allowedOrigins[], expiresInMin? }
//          → { token }             (auth ADMIN — `raw` se devuelve UNA sola vez)
//   DELETE { tokenId } → { ok }    (auth ADMIN)
//
// Existe porque `fleetAgent.token` es omnipotente: sin esto no hay forma de darle a un
// integrador una credencial que sólo pueda mandar mensajes.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

const VALID_SCOPES: FleetTokenScope[] = ["MESSAGE", "MANAGE", "ADMIN"];

export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    await authFleetAgent(request, params.fleetAgentId!, "ADMIN");
  } catch (e) {
    return json({ error: "Unauthorized" }, e instanceof Response ? e.status : 401);
  }
  return json({ tokens: await listFleetTokens(params.fleetAgentId!) });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fleetAgentId = params.fleetAgentId!;
  try {
    await authFleetAgent(request, fleetAgentId, "ADMIN");
  } catch (e) {
    return json({ error: "Unauthorized" }, e instanceof Response ? e.status : 401);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (request.method === "DELETE") {
    const tokenId = typeof body.tokenId === "string" ? body.tokenId : "";
    if (!tokenId) return json({ error: "tokenId required" }, 400);
    await revokeFleetToken(tokenId, fleetAgentId);
    return json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "name required" }, 400);

  const scopes = Array.isArray(body.scopes)
    ? (body.scopes.filter((s): s is FleetTokenScope =>
        VALID_SCOPES.includes(s as FleetTokenScope)
      ))
    : [];
  if (!scopes.length) return json({ error: "scopes required", valid: VALID_SCOPES }, 400);

  const expiresInMin = typeof body.expiresInMin === "number" ? body.expiresInMin : null;

  try {
    const token = await createFleetToken(fleetAgentId, {
      name,
      scopes,
      publishable: body.publishable === true,
      cfgId: typeof body.cfgId === "string" ? body.cfgId : null,
      allowedOrigins: Array.isArray(body.allowedOrigins)
        ? body.allowedOrigins.filter((o): o is string => typeof o === "string")
        : [],
      expiresAt: expiresInMin ? new Date(Date.now() + expiresInMin * 60_000) : null,
    });
    return json({ token });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "no se pudo crear el token" }, 400);
  }
}
