import type { Route } from "./+types/fleet-agents.$fleetAgentId.waba.message";
import { db } from "~/.server/db";
import { routeMessage } from "~/.server/core/fleetAgentOperations";

// POST /api/v2/fleet-agents/:fleetAgentId/waba/message
//
// The WABA channel inbound. Formmy owns the Meta WhatsApp Business number and is
// the gateway: it receives the Meta webhook and FORWARDS each inbound message
// here using its "droplet protocol", then expects us to POST the reply back to
// Formmy's /send endpoint. So WABA becomes another entry into the SAME fleetAgent
// fleet that Baileys uses — both end in routeMessage().
//
// Fire-and-forget: Formmy doesn't await the reply (it ignores this response
// body), and Meta penalizes slow webhooks, so we ACK 200 immediately and do the
// LLM turn + send-back in a DETACHED task (mirrors whatsapp-webhook.ts, which
// does `void handleIncomingText(...)` then returns 200).
//
// Auth = fleetAgent.wabaConfig.formmySecret (the shared secret Formmy presents AND the
// one we present back). NOT fleetAgent.token — that bearer belongs to the Baileys
// surface / web channel.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// www: el apex formmy.app falla TLS desde Fly (mismo motivo que formmy.server.ts en Denik).
const FORMMY_BASE_URL = (process.env.FORMMY_BASE_URL || "https://www.formmy.app").replace(/\/$/, "");

// Per-integration (per Meta number) config. phoneNumberId is the only field the
// gateway strictly needs; name/systemPrompt give each number its OWN identity
// (injected as appendSystemPrompt, layer 3). denikApiKey is OPTIONAL — the
// reseller (denik) path; native pools scope capabilities via groupConfigs.
type WabaOrg = {
  phoneNumberId?: string;
  phoneNumber?: string;
  name?: string;
  systemPrompt?: string;
  denikApiKey?: string;
  // Número marcado como ADMIN (estrella ★ "Main" en el dashboard, igual que el
  // mainGroupJid de Baileys). Opt-in: solo si admin===true su self-chat administra.
  admin?: boolean;
  // (Opcional) conversación designada como admin además del self-chat (sender en
  // dígitos). Solo aplica si admin===true. Sin UI hoy; reservado.
  adminSender?: string;
  // Modo de respuesta del número (3 estados):
  //  - "off"  → no responde a nadie.
  //  - "all"  → responde a todos EXCEPTO `mutedSenders` (encendido excepto-para).
  //  - "only" → responde SOLO a `allowedSenders` (encender solo-para / allowlist).
  // `undefined` → se deriva de `enabled` (compat): enabled===false → "off", else "all".
  responseMode?: "off" | "all" | "only";
  // Legacy master ON/OFF (compat con números ya conectados). undefined = encendido.
  enabled?: boolean;
  // Modo "only": conversaciones (senders, dígitos) permitidas — solo contesta ahí.
  allowedSenders?: string[];
  // Estado de pausa de coexistencia LEÍDO de Formmy (fuente única): por conversación,
  // el `paused_until` (ISO) que Formmy manda en cada forward. Solo para VISIBILIDAD
  // en el Inbox; el gate real usa `manual_mode` del mensaje. La mutación (pausar/
  // reactivar) la hace Formmy vía el endpoint /coexistence/control.
  pausedUntil?: Record<string, string>;
};

// Resuelve el modo efectivo (deriva de `enabled` si aún no hay `responseMode`).
function resolveMode(org: WabaOrg | undefined): "off" | "all" | "only" {
  if (org?.responseMode) return org.responseMode;
  return org?.enabled === false ? "off" : "all";
}

// Normaliza un teléfono para comparar: quita @sufijo, todo lo no-dígito y el +, y
// colapsa el "1" extra de México (521 → 52). org.phoneNumber viene del
// display_phone_number de Meta (formateado); el droplet `sender` viene en dígitos
// crudos → sin normalizar casi nunca matchean. (Otros países podrían necesitar más.)
function normalizePhone(s: string | undefined | null): string {
  let d = (s ?? "").replace(/@.*$/, "").replace(/\D/g, "");
  if (d.startsWith("521")) d = "52" + d.slice(3);
  return d;
}
type WabaConfig = {
  formmySecret?: string;
  orgs?: Record<string, WabaOrg>;
};

// Formmy droplet protocol (the inbound forward body).
type DropletInbound = {
  jid?: string;
  sender?: string;
  sender_name?: string;
  content?: string;
  message_id?: string;
  integration_id?: string;
  is_from_me?: boolean;
  manual_mode?: boolean;
  paused_until?: string; // estado de pausa de Formmy (fuente única) — para visibilidad
  media?: unknown;
};

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

  const body = (await request.json().catch(() => ({}))) as DropletInbound;
  const integrationId = typeof body.integration_id === "string" ? body.integration_id : "";
  const sender = typeof body.sender === "string" ? body.sender : "";
  const content = typeof body.content === "string" ? body.content : "";
  // Nombre de perfil del contacto (Formmy lo manda en sender_name). Ignora
  // "Operador" (placeholder de ecos) y los que son solo el teléfono.
  const rawName = typeof body.sender_name === "string" ? body.sender_name.trim() : "";
  const senderName = rawName && rawName !== "Operador" && rawName.replace(/\D/g, "") !== normalizePhone(sender) ? rawName : "";

  // ADMIN: el dueño escribe desde su conversación admin (self-chat = sender es el
  // propio número, o un sender designado en org.adminSender). En ese caso SÍ
  // contestamos (turno admin con tools mcp__admin__*), ignorando a propósito el
  // drop de is_from_me/manual_mode (el self-chat del dueño puede estar auto-pausado).
  const org = waba!.orgs?.[integrationId];
  const np = normalizePhone(sender);
  // El SELF-CHAT (mensajearte a tu propio número) administra POR DEFAULT — solo se
  // apaga con la ★ Main en off (org.admin === false). Además un adminSender
  // designado puede administrar. En coexistencia el note-to-self llega como
  // smb_message_echoes con from===to===tu número → Formmy lo reenvía is_from_me:true,
  // sender=tu número.
  const isAdmin =
    !!body.is_from_me &&
    !!np &&
    ((org?.admin !== false && np === normalizePhone(org?.phoneNumber)) ||
      (!!org?.adminSender && np === normalizePhone(org.adminSender)));

  // Gate del número por modo: off → nadie; all → todos; only → solo allowedSenders.
  // El silencio POR-CONVERSACIÓN no vive aquí: lo maneja la PAUSA de coexistencia
  // (Formmy = fuente única, vía `manual_mode`). Los turnos ADMIN ignoran este gate.
  const mode = resolveMode(org);
  const allowed = (org?.allowedSenders ?? []).some((s) => normalizePhone(s) === np);
  const shouldRespond = mode === "all" ? true : mode === "only" ? allowed : false;

  // Visibilidad: cachea el `paused_until` que Formmy manda (fuente única) para que el
  // Inbox muestre "⏸ en pausa". Solo escribe si cambió (no en cada mensaje).
  if (integrationId && np) {
    void recordPausedUntil(fleetAgentId, integrationId, np, body.paused_until ?? null);
  }

  // ACK immediately. Anything that means "nothing to answer" still returns 200 —
  // Formmy ignores the body, and a non-200 just makes it (or Meta) retry.
  //  - is_from_me: nuestro eco, nunca contestar — EXCEPTO turno admin (arriba).
  //  - manual_mode: Formmy pausó esta conversación (tú la atiendes) — no contestamos.
  if (integrationId && sender && content.trim()) {
    if (isAdmin) {
      void handleWabaInbound(fleetAgentId, waba!, { integrationId, sender, content, senderName, admin: true });
    } else if (!body.is_from_me && shouldRespond && !body.manual_mode) {
      void handleWabaInbound(fleetAgentId, waba!, { integrationId, sender, content, senderName });
    }
  }

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}

// Registra que el dueño respondió a `np` (eco de coexistencia) → marca la pausa de
// esa conversación. Merge en wabaConfig.orgs[int].pausedAt, podando entradas más
// viejas que la ventana (no crece sin límite). Fire-and-forget; nunca lanza.
// Cachea (para VISIBILIDAD en el Inbox) el `paused_until` que Formmy manda por
// conversación. Formmy es la fuente de verdad; esto es solo un espejo de lectura.
// `until=null` (Formmy reanudó) → borra la entrada. Escribe SOLO si cambió, para no
// pegarle a la DB en cada mensaje. Poda entradas ya expiradas. Fire-and-forget.
async function recordPausedUntil(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  until: string | null
): Promise<void> {
  try {
    const fa = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { wabaConfig: true } });
    const cfg = (fa?.wabaConfig as WabaConfig | null) ?? {};
    const org = cfg.orgs?.[integrationId];
    if (!org) return;
    const prev = org.pausedUntil ?? {};
    const now = Date.now();
    const cur: Record<string, string> = {};
    // Conserva las entradas aún vigentes (poda expiradas).
    for (const [k, v] of Object.entries(prev)) if (Date.parse(v) > now) cur[k] = v;
    if (until && Date.parse(until) > now) cur[np] = until;
    else delete cur[np];
    if (JSON.stringify(cur) === JSON.stringify(prev)) return; // sin cambio → no escribir
    const next: WabaConfig = { ...cfg, orgs: { ...cfg.orgs, [integrationId]: { ...org, pausedUntil: cur } } };
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { wabaConfig: next } });
  } catch (e) {
    console.error(`[waba] recordPausedUntil ${fleetAgentId}/${np} failed:`, e instanceof Error ? e.message : e);
  }
}

// Detached task: run the fleetAgent turn, then POST the reply back to Formmy's /send.
// Never throws (it runs unawaited) — every failure is logged and swallowed.
async function handleWabaInbound(
  fleetAgentId: string,
  waba: WabaConfig,
  msg: { integrationId: string; sender: string; content: string; senderName?: string; admin?: boolean }
): Promise<void> {
  try {
    const org = waba.orgs?.[msg.integrationId];
    // groupId is OPAQUE to routeMessage; scope it per (integration, sender) so the
    // sticky route + .jsonl transcript stay per-conversation (1:1 memory per
    // customer), parallel to Baileys' `jid`. configGroupId is per-NUMBER
    // (waba:<integrationId>) so capabilities + key resolve once per Meta number,
    // not per sender. Identity per number = org.systemPrompt as appendSystemPrompt.
    const reply = await routeMessage(
      fleetAgentId,
      {
        groupId: `waba:${msg.integrationId}:${msg.sender}`,
        configGroupId: `waba:${msg.integrationId}`,
        sender: msg.sender,
        text: msg.content,
        senderName: msg.senderName,
        appendSystemPrompt: org?.systemPrompt,
        denikApiKey: org?.denikApiKey,
        admin: msg.admin,
      },
      { skipRateLimit: false }
    );
    if (!reply) return;
    await sendReplyToFormmy(waba.formmySecret ?? "", msg.integrationId, msg.sender, reply);
  } catch (e) {
    console.error(`[waba] fleetAgent ${fleetAgentId} inbound failed:`, e instanceof Error ? e.message : e);
  }
}

// POST the agent's reply back to Formmy, which relays it to Meta. phone_number is
// the sender's digits (strip any @suffix jid and a leading +).
async function sendReplyToFormmy(
  formmySecret: string,
  integrationId: string,
  sender: string,
  reply: string
): Promise<void> {
  const phone = sender.replace(/@.*$/, "").replace(/^\+/, "");
  try {
    const res = await fetch(`${FORMMY_BASE_URL}/api/v1/integrations/whatsapp/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${formmySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phone,
        integration_id: integrationId,
        type: "text",
        text: reply,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[waba] send-back to Formmy failed ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[waba] send-back to Formmy threw:", e instanceof Error ? e.message : e);
  }
}
