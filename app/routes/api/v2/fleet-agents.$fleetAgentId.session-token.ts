import type { Route } from "./+types/fleet-agents.$fleetAgentId.session-token";
import { authFleetAgent } from "~/.server/apiAuth";
import { createFleetToken } from "~/.server/core/fleetTokens";

// POST /api/v2/fleet-agents/:fleetAgentId/session-token
//
// Mintea un `flt_pk_` EFÍMERO de sólo-mensajería para UNA sesión de navegador.
// Es la receta de embebido: el backend del integrador llama aquí con su `flt_sk_`
// (scope MANAGE) y le pasa al navegador el token corto que vuelve. Así el widget
// nunca sostiene una credencial durable ni puede administrar el agente.
//
//   POST { cfgId?, ttlMin?, allowedOrigins? } → { token, expiresAt }
//
// `cfgId` ata el token a un tenant: los turnos hechos con él IGNORAN el
// configGroupId que mande el cliente, así que una sesión no puede saltar de tenant.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

const DEFAULT_TTL_MIN = 15;
const MAX_TTL_MIN = 12 * 60;

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return json({ error: "Method not allowed" }, 405);
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const fleetAgentId = params.fleetAgentId!;
  // MANAGE, no ADMIN: emitir tokens de sesión es una operación de rutina del
  // integrador y no debería obligarle a tener a mano su credencial más peligrosa.
  try {
    await authFleetAgent(request, fleetAgentId, "MANAGE");
  } catch (e) {
    return json({ error: "Unauthorized" }, e instanceof Response ? e.status : 401);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ttlMin = Math.min(
    typeof body.ttlMin === "number" && body.ttlMin > 0 ? body.ttlMin : DEFAULT_TTL_MIN,
    MAX_TTL_MIN
  );
  const expiresAt = new Date(Date.now() + ttlMin * 60_000);

  const token = await createFleetToken(fleetAgentId, {
    name: `sesión ${typeof body.cfgId === "string" ? body.cfgId : "web"}`,
    scopes: ["MESSAGE"],
    publishable: true,
    cfgId: typeof body.cfgId === "string" ? body.cfgId : null,
    allowedOrigins: Array.isArray(body.allowedOrigins)
      ? body.allowedOrigins.filter((o): o is string => typeof o === "string")
      : [],
    expiresAt,
  });

  return json({ token: token.raw, expiresAt: expiresAt.toISOString(), cfgId: token.cfgId });
}
