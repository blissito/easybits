import crypto from "node:crypto";
import type { Route } from "./+types/whatsapp-webhook";
import logger from "~/.server/logger";
import {
  type WaWebhookPayload,
  resolveWaConfig,
  markProcessed,
  handleIncomingText,
} from "~/.server/integrations/whatsapp/cloudApi.server";

// WhatsApp Business Cloud API (Meta) webhook.
//
// URL de devolución de llamada (panel de Meta):
//   https://www.easybits.cloud/api/v2/whatsapp/webhook
//
// GET  → handshake de verificación (hub.mode/hub.verify_token/hub.challenge).
// POST → eventos: validamos firma HMAC, filtramos mensajes viejos/duplicados,
//        y enrutamos texto entrante a un agente de EasyBits (fire-and-forget).
//
// Config: ver app/.server/integrations/whatsapp/cloudApi.server.ts

// GET: verification handshake
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe") {
    return new Response("invalid mode", { status: 400 });
  }

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    logger.error("WhatsApp webhook: WHATSAPP_VERIFY_TOKEN not configured");
    return new Response("verify token not configured", { status: 500 });
  }
  if (token !== expected) {
    logger.warn("WhatsApp webhook: token verification failed");
    return new Response("forbidden", { status: 403 });
  }
  if (!challenge) {
    return new Response("no challenge", { status: 400 });
  }

  logger.info("WhatsApp webhook verified");
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// POST: event notifications
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const raw = await request.text();

  // Verificar firma HMAC (X-Hub-Signature-256: sha256=<hex>).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    const ok =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) {
      logger.warn("WhatsApp webhook: invalid signature");
      return new Response("invalid signature", { status: 403 });
    }
  }

  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(raw) as WaWebhookPayload;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      // Status callbacks (sent/delivered/read/failed) — solo logueamos fallos.
      for (const s of value.statuses ?? []) {
        if (s.status === "failed") {
          logger.error("WhatsApp status failed", {
            wamid: s.id,
            recipient: s.recipient_id,
            errors: s.errors,
          });
        }
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const message of value.messages ?? []) {
        // Skip echoes del propio número (coexistencia — no soportada aquí).
        if (message.from === phoneNumberId) continue;

        // Dedup (Meta reintenta) + filtro de mensajes viejos (>12 min, best
        // practice de Meta para no contestar backlog tras un downtime).
        if (!markProcessed(message.id)) continue;
        const ageMin = (Date.now() - Number(message.timestamp) * 1000) / 60000;
        if (ageMin > 12) {
          logger.warn("WhatsApp skipping old message", {
            messageId: message.id,
            ageMin: ageMin.toFixed(1),
          });
          continue;
        }

        // Solo texto en v1. Otros tipos (media, location, etc.) quedan
        // pendientes — se acusan 200 igual para que Meta no reintente.
        if (message.type !== "text") {
          logger.info("WhatsApp unsupported message type", { type: message.type });
          continue;
        }

        const config = resolveWaConfig(phoneNumberId);
        if (!config) {
          logger.error("WhatsApp no config for phone_number_id", { phoneNumberId });
          continue;
        }

        // Fire-and-forget: el agente puede tardar; Meta exige 200 rápido.
        void handleIncomingText(config, message);
      }
    }
  }

  return new Response("ok", { status: 200 });
}
