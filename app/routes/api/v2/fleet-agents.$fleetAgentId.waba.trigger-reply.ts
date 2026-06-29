import type { Route } from "./+types/fleet-agents.$fleetAgentId.waba.trigger-reply";
import { db } from "~/.server/db";
import {
  type WabaConfig,
  normalizePhone,
  setPausedUntilAtomic,
  replyToPendingWaba,
} from "~/.server/integrations/whatsapp/waba.server";

// POST /api/v2/fleet-agents/:fleetAgentId/waba/trigger-reply
//
// Wake-up del agente que Formmy llama al REACTIVAR una conversación desde su CRM
// (operador "vuelve a darle al bot"). NanoClaw (droplet) ya exponía /trigger-reply;
// easybits NO → Formmy recibía 404 y el agente nunca despertaba. Esto lo arregla:
// despausa el cache local + hace que el agente conteste los mensajes PENDIENTES.
//
// Contrato de Formmy (conversationControl.server.ts): POST con Bearer = formmySecret,
// body { jid: "formmy_<integrationId>_<phone>", integration_id }. Fire-and-forget.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type TriggerBody = { jid?: string; integration_id?: string; phone_number?: string };

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgentId = params.fleetAgentId!;
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  const waba = (fleetAgent?.wabaConfig as WabaConfig | null) ?? null;
  const formmySecret = waba?.formmySecret ?? "";
  if (!fleetAgent || !bearer || !formmySecret || formmySecret !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const body = (await request.json().catch(() => ({}))) as TriggerBody;
  const integrationId = typeof body.integration_id === "string" ? body.integration_id : "";
  // sender = el teléfono. Viene en phone_number o se extrae del jid formmy_<int>_<phone>.
  let sender = typeof body.phone_number === "string" ? body.phone_number : "";
  if (!sender && typeof body.jid === "string") {
    const m = /^formmy_[^_]+_(.+)$/.exec(body.jid);
    if (m) sender = m[1];
  }
  const org = waba!.orgs?.[integrationId];
  if (!integrationId || !sender || !org) {
    return Response.json({ ok: false, error: "missing integration/sender" }, { status: 200, headers: CORS });
  }

  // Despausar el cache local (Formmy ya reactivó su lado) y contestar lo pendiente.
  // Fire-and-forget: ACK 200 ya; el turno corre detached (Meta penaliza webhooks lentos).
  void (async () => {
    try {
      await setPausedUntilAtomic(fleetAgentId, integrationId, normalizePhone(sender), null).catch(() => {});
      const r = await replyToPendingWaba({
        fleetAgentId,
        ownerId: fleetAgent.ownerId,
        formmySecret,
        integrationId,
        sender,
        org,
      });
      if (!r.ok) console.log(`[waba] trigger-reply ${fleetAgentId} ${sender}: ${r.error}`);
    } catch (e) {
      console.error(`[waba] trigger-reply ${fleetAgentId} failed:`, e instanceof Error ? e.message : e);
    }
  })();

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}
