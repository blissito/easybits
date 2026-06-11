// WhatsApp Business Cloud API (Meta) — server helpers for the webhook.
//
// Distinto del path openclaw (QR/pairing) en whatsappOperations.ts: aquí
// hablamos la Cloud API oficial de Meta. Meta llama a nuestro webhook con
// mensajes entrantes; nosotros los enrutamos a un agente de EasyBits y
// devolvemos la respuesta vía Graph API.
//
// Config (single WABA number, vía env vars):
//   WHATSAPP_VERIFY_TOKEN     — token del handshake GET (lo pegas en Meta)
//   WHATSAPP_APP_SECRET       — App Secret de Meta, valida X-Hub-Signature-256
//   WHATSAPP_PHONE_NUMBER_ID  — phone_number_id de tu número (para responder)
//   WHATSAPP_ACCESS_TOKEN     — token Graph API (System User token recomendado)
//   WHATSAPP_AGENT_ID         — id del Agent de EasyBits que responde
//
// Multi-número queda como follow-up: bastaría con un mapa
// phone_number_id → { accessToken, agentId } en DB.

import { db } from "../../db";
import logger from "../../logger";
import { openAgentChunkStream } from "../../core/sandboxOperations";

const GRAPH_VERSION = "v21.0";

// ─── Payload types (Cloud API webhook) — subset usado aquí ───────────────────

export interface WaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  context?: { from?: string; id?: string };
}

export interface WaWebhookValue {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WaWebhookMessage[];
  statuses?: Array<{
    id: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    recipient_id: string;
    errors?: unknown;
  }>;
}

export interface WaWebhookEntry {
  id: string;
  changes: Array<{ value: WaWebhookValue; field: string }>;
}

export interface WaWebhookPayload {
  object: string;
  entry: WaWebhookEntry[];
}

// ─── Config resolution ───────────────────────────────────────────────────────

export interface WaConfig {
  phoneNumberId: string;
  accessToken: string;
  agentId: string;
}

// Devuelve la config para un phone_number_id entrante, o null si no hay match
// (o falta config). Single-tenant: si WHATSAPP_PHONE_NUMBER_ID está vacío,
// aceptamos cualquier phoneNumberId y usamos las env vars tal cual.
export function resolveWaConfig(phoneNumberId: string): WaConfig | null {
  const envPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const agentId = process.env.WHATSAPP_AGENT_ID;

  if (!accessToken || !agentId) return null;
  if (envPhone && envPhone !== phoneNumberId) return null;

  return { phoneNumberId, accessToken, agentId };
}

// ─── Dedup (best-effort, in-memory) ──────────────────────────────────────────
// Meta reintenta el webhook si tardamos o fallamos. En una sola instancia Fly
// un Set en memoria basta para no procesar el mismo wamid dos veces. Cap para
// no crecer sin límite.

const processedIds = new Set<string>();
const PROCESSED_CAP = 5000;

export function markProcessed(messageId: string): boolean {
  if (processedIds.has(messageId)) return false;
  processedIds.add(messageId);
  if (processedIds.size > PROCESSED_CAP) {
    // Drop oldest ~10% (insertion order preserved by Set).
    const drop = Math.floor(PROCESSED_CAP * 0.1);
    let i = 0;
    for (const id of processedIds) {
      processedIds.delete(id);
      if (++i >= drop) break;
    }
  }
  return true;
}

// ─── Send a text message back via Graph API ──────────────────────────────────

export async function sendWhatsAppText(
  config: WaConfig,
  to: string,
  text: string,
  contextMessageId?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error("WhatsApp send failed", { status: res.status, detail: detail.slice(0, 500) });
    throw new Error(`graph send ${res.status}`);
  }
}

// ─── Collect an agent reply (consume unified SSE → plain text) ────────────────

async function collectAgentReply(content: string, agentId: string): Promise<string> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row) throw new Error(`agent ${agentId} not found`);
  if (row.status !== "running") throw new Error(`agent ${agentId} is ${row.status}`);

  const stream = await openAgentChunkStream(
    {
      agentId: row.id,
      ownerId: row.ownerId,
      sandboxId: row.sandboxId,
      protocol: row.protocol ?? "sse",
      port: row.port ?? 3000,
      messagePath: row.messagePath ?? "/message",
      acpSessionId: row.acpSessionId,
      acpTransportSessionId: row.acpTransportSessionId,
      embedToken: row.embedToken,
      template: row.template,
    },
    { content }
  );

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  const consume = (raw: string) => {
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json) as { type?: string; value?: string; message?: string };
        if (evt.type === "chunk" && typeof evt.value === "string") reply += evt.value;
        else if (evt.type === "error") throw new Error(evt.message || "agent stream error");
      } catch (e) {
        if (e instanceof Error && e.message.includes("agent stream")) throw e;
        // Ignorar líneas data: no-JSON (keep-alives, etc.)
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lastNl = buffer.lastIndexOf("\n");
    if (lastNl >= 0) {
      consume(buffer.slice(0, lastNl));
      buffer = buffer.slice(lastNl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);

  return reply.trim();
}

// ─── Orchestration: incoming text → agent → reply ─────────────────────────────
// Fire-and-forget desde el webhook (no se await) para que devolvamos 200 a
// Meta de inmediato. En el server persistente de Fly el promise continúa tras
// retornar la Response.

export async function handleIncomingText(
  config: WaConfig,
  message: WaWebhookMessage
): Promise<void> {
  const text = message.text?.body?.trim();
  if (!text) return;

  try {
    const reply = await collectAgentReply(text, config.agentId);
    if (!reply) {
      logger.warn("WhatsApp agent returned empty reply", { messageId: message.id });
      return;
    }
    await sendWhatsAppText(config, message.from, reply, message.id);
    logger.info("WhatsApp reply sent", { to: message.from, messageId: message.id });
  } catch (e) {
    logger.error("WhatsApp incoming handler failed", {
      messageId: message.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
