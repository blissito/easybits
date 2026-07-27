import type { Route } from "./+types/fleet-agents.$fleetAgentId.waba.message";
import { db } from "~/.server/db";
import {
  type WabaConfig,
  normalizePhone,
  resolveMode,
  adminSetOf,
  parseDropletMedia,
  parseWabaExtras,
  hasWabaExtras,
  stripFormmyPlaceholder,
  recordPausedUntil,
  persistInboundUserMessage,
  enqueueWabaTurn,
} from "~/.server/integrations/whatsapp/waba.server";
import { summarizeUnhandled, wabaExtraLines } from "~/.server/integrations/whatsapp/inboundMedia.server";

// POST /api/v2/fleet-agents/:fleetAgentId/waba/message
//
// The WABA channel inbound. Formmy owns the Meta WhatsApp Business number and is
// the gateway: it receives the Meta webhook and FORWARDS each inbound message
// here using its "droplet protocol", then expects us to POST the reply back to
// Formmy's /send. So WABA becomes another entry into the SAME fleet that Baileys
// uses — both end in routeMessage(). Fire-and-forget: ACK 200 immediately and do
// the LLM turn + send-back in a DETACHED task (Meta penalizes slow webhooks).
//
// Auth = fleetAgent.wabaConfig.formmySecret (the shared secret Formmy presents AND
// the one we present back). NOT fleetAgent.token (that's the Baileys/web bearer).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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
  // El resto del envelope del canal (server/channels/handler.ts de Formmy). Se venía
  // descartando en silencio: una ubicación compartida para una entrega se perdía entera y
  // un mensaje de campaña llegaba como el placeholder "📎 [system]" sin nada más.
  location?: unknown;
  contacts?: unknown;
  reaction?: unknown;
  quoted?: unknown;
  unhandled?: unknown;
  referral?: unknown;
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
  const rawContent = typeof body.content === "string" ? body.content : "";
  const media = parseDropletMedia(body.media);
  const extras = parseWabaExtras(body as Record<string, unknown>);
  // El placeholder emoji de Formmy sobra cuando además nos manda el campo estructurado.
  const content = stripFormmyPlaceholder(rawContent, extras);
  // Diagnóstico de los tipos que Meta no mapea (campañas, avisos de sistema, botones).
  // Allowlist estricta: nunca sale el teléfono ni el texto del cliente. Es la ÚNICA forma
  // de saber qué son realmente esos mensajes — sin esto son una caja negra.
  if (extras.unhandled) {
    console.log(
      `[waba] unhandled ${fleetAgentId} ${integrationId}`,
      JSON.stringify({ meta_type: extras.unhandled.meta_type, ...summarizeUnhandled(extras.unhandled.raw) })
    );
  }
  // Nombre de perfil del contacto. Ignora "Operador" (placeholder de ecos) y los
  // que son solo el teléfono.
  const rawName = typeof body.sender_name === "string" ? body.sender_name.trim() : "";
  const senderName = rawName && rawName !== "Operador" && rawName.replace(/\D/g, "") !== normalizePhone(sender) ? rawName : "";

  const org = waba!.orgs?.[integrationId];
  const np = normalizePhone(sender);

  // ADMIN POR CONVERSACIÓN: el sender está designado como admin de este número.
  // Independiente de is_from_me (un contacto real — ej. Brenda — administra). El
  // self-chat ya NO se usa: muerto en WABA (Meta #100).
  const isAdmin = !!np && adminSetOf(org).has(np);

  // Gate por modo: off → nadie; all → todos; only → solo allowedSenders. El silencio
  // por-conversación lo maneja la PAUSA de coexistencia (Formmy, vía manual_mode).
  // Turnos ADMIN ignoran gate y pausa.
  const mode = resolveMode(org);
  const allowed = (org?.allowedSenders ?? []).some((s) => normalizePhone(s) === np);
  const shouldRespond = mode === "all" ? true : mode === "only" ? allowed : false;

  // Visibilidad del Inbox: cachea el `paused_until` de Formmy (escritura atómica).
  if (integrationId && np) {
    void recordPausedUntil(fleetAgentId, integrationId, np, body.paused_until ?? null);
  }

  // ACK immediately. Anything that means "nothing to answer" still returns 200.
  // `hasExtras` es parte del guard: una ubicación o un contacto SIN texto son un mensaje
  // completo, y al limpiar el placeholder de Formmy se caerían por el `content` vacío.
  const hasExtras = hasWabaExtras(extras);
  const hasInbound = !!(content.trim() || media || hasExtras);
  // Una reacción SOLA no merece un turno: runWabaTurn manda 👀 + "escribiendo…" + ✅ por
  // turno, así que cada 👍 del cliente se vería como el bot despertando, costaría un worker
  // completo y probablemente arrancaría un "¡de nada!". Se registra y ya. Si la reacción
  // viene acompañando texto o media, sigue el camino normal y su línea va en el framing.
  const reactionOnly = !!extras.reaction && !content.trim() && !media && !extras.location && !extras.contacts?.length;
  if (integrationId && sender && hasInbound) {
    const willRun = !reactionOnly && (isAdmin || (!body.is_from_me && shouldRespond && !body.manual_mode));
    if (willRun) {
      // Encola (coalescing por conversación) → UN turno a la vez = un solo worker
      // sticky (sin la carrera que spawneaba varios y partía la memoria).
      enqueueWabaTurn(
        { fleetAgentId, ownerId: fleetAgent.ownerId, formmySecret, integrationId, sender, org, admin: isAdmin },
        { content, media, senderName, extras, messageId: typeof body.message_id === "string" ? body.message_id : undefined }
      );
    } else if (!body.is_from_me) {
      // No corremos turno (pausa/muted/off) pero NO es nuestro eco → persiste para
      // el Inbox + "Solicitar respuesta".
      // Con el placeholder ya limpio, el texto para el Inbox sale del framing (la ubicación
      // con su link, el contacto con su tel) en vez de quedar vacío.
      const inboxText = content.trim() || wabaExtraLines(extras).join(" ");
      void persistInboundUserMessage(fleetAgentId, integrationId, sender, senderName, inboxText, media);
    }
  }

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}
