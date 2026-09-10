import type { Route } from "./+types/fleet-agents.$fleetAgentId.messages";
import { authFleetAgent, type FleetAuthResult } from "~/.server/apiAuth";
import { corsForFleetAuth } from "~/.server/core/fleetCors";
import { checkFleetAgentWebIp, checkFleetTokenRate } from "~/.server/rateLimiter";
import { listFleetMessages } from "~/.server/core/fleetAgentOperations";

// GET /api/v2/fleet-agents/:fleetAgentId/messages?groupId=…&since=<cursor>&limit=50
//
// El historial de una conversación, con cursor de seguimiento de cola. Es la mitad que
// le faltaba a EasyBits para que un tercero pueda construir una app móvil encima:
//
//   1. la app manda un turno y se va al fondo,
//   2. iOS/Android mata el socket; el turno sigue vivo en la microVM,
//   3. al terminar sale el webhook `turn.completed` con un `cursor`,
//   4. el backend del integrador dispara su push,
//   5. la app vuelve y pide `?since=<ese cursor>` — solo lo nuevo, una llamada.
//
// `gap:true` es la parte honesta: significa "no te fíes de este delta, recarga entero".
// Sale cuando el cursor ya no sirve, y —lo que de verdad importa— cuando el AGENTE
// perdió su memoria: el hilo se lee perfecto, pero el modelo empieza en blanco.
//
// Auth = el mismo bearer que `/message` (scope MESSAGE), así que un `flt_pk_` efímero de
// navegador sirve sin darle a nadie permisos de administración.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const fleetAgentId = params.fleetAgentId!;
  let auth: FleetAuthResult;
  try {
    auth = await authFleetAgent(request, fleetAgentId, "MESSAGE", { allowFormmySecret: true });
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json(
      { error: status === 403 ? "Forbidden" : "Unauthorized" },
      { status, headers: CORS }
    );
  }
  const cors = corsForFleetAuth(request, auth, CORS);

  // Mismos guardas que el POST: por TOKEN primero (una llave filtrada se usa desde
  // muchas IPs, así que el tope por IP no la frena) y luego por IP.
  if (auth.tokenId && !(await checkFleetTokenRate(auth.tokenId))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests for this token." },
      { status: 429, headers: { ...cors, "Retry-After": "30" } }
    );
  }
  if (!(await checkFleetAgentWebIp(request))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests, please slow down." },
      { status: 429, headers: { ...cors, "Retry-After": "30" } }
    );
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  if (!groupId) {
    return Response.json({ error: "groupId is required" }, { status: 400, headers: cors });
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const page = await listFleetMessages(fleetAgentId, groupId, {
    since: url.searchParams.get("since"),
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return Response.json(page, { headers: cors });
}
