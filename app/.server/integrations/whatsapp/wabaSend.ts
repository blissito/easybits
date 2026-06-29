// Outbound to the WABA channel (Formmy gateway → Meta). Single sender used by BOTH
// the inbound handler (waba.message.ts) and the dashboard "Solicitar respuesta"
// action, for text AND media. Formmy's /send accepts media_url (Meta downloads it)
// or media_base64 (Formmy uploads to Meta). Voice notes (PTT) are just
// type:"audio" + mime_type "audio/ogg; codecs=opus" — Meta renders the waveform
// client-side, so (unlike Baileys) we never compute one here.
//
// www: el apex formmy.app falla TLS desde Fly → usar www.
const FORMMY_BASE_URL = (process.env.FORMMY_BASE_URL || "https://www.formmy.app").replace(/\/$/, "");

export type WabaMediaType = "image" | "video" | "audio" | "document" | "sticker";

export type WabaSendPayload =
  | { type: "text"; text: string }
  | {
      type: WabaMediaType;
      media_base64?: string;
      media_url?: string;
      mime_type?: string;
      caption?: string;
      filename?: string;
    };

// phone_number = the sender's digits (strip any @suffix jid and a leading +).
function phoneOf(sender: string): string {
  return sender.replace(/@.*$/, "").replace(/^\+/, "");
}

export async function sendToFormmy(
  formmySecret: string,
  integrationId: string,
  sender: string,
  payload: WabaSendPayload
): Promise<boolean> {
  try {
    const res = await fetch(`${FORMMY_BASE_URL}/api/v1/integrations/whatsapp/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${formmySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone_number: phoneOf(sender), integration_id: integrationId, ...payload }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[waba] send ${payload.type} failed ${res.status}: ${detail.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[waba] send ${payload.type} threw:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export function sendTextToFormmy(
  formmySecret: string,
  integrationId: string,
  sender: string,
  text: string
): Promise<boolean> {
  return sendToFormmy(formmySecret, integrationId, sender, { type: "text", text });
}

// A deliverFilesFromReply-compatible SendFn (jid, content) bound to a WABA target.
// deliverFilesFromReply hands us { image: Buffer, mimetype? } or
// { document: Buffer, mimetype, fileName } — we base64 it and relay to Formmy.
export function makeWabaFileSender(
  formmySecret: string,
  integrationId: string,
  sender: string
): (jid: string, content: Record<string, unknown>) => Promise<unknown> {
  return async (_jid, content) => {
    const img = content.image as Buffer | undefined;
    const doc = content.document as Buffer | undefined;
    if (img) {
      return sendToFormmy(formmySecret, integrationId, sender, {
        type: "image",
        media_base64: img.toString("base64"),
        mime_type: (content.mimetype as string) || "image/jpeg",
      });
    }
    if (doc) {
      return sendToFormmy(formmySecret, integrationId, sender, {
        type: "document",
        media_base64: doc.toString("base64"),
        mime_type: (content.mimetype as string) || "application/octet-stream",
        filename: (content.fileName as string) || "archivo",
      });
    }
    return false;
  };
}

// Voice note (PTT). Kokoro returns an OGG/Opus buffer; Meta draws the waveform.
export function sendVoiceToFormmy(
  formmySecret: string,
  integrationId: string,
  sender: string,
  ogg: Buffer
): Promise<boolean> {
  return sendToFormmy(formmySecret, integrationId, sender, {
    type: "audio",
    media_base64: ogg.toString("base64"),
    mime_type: "audio/ogg; codecs=opus",
  });
}
