// Inbound WhatsApp media → text, for the Pool's Baileys edge.
//
// The pool's worker (claude-worker) is a pure TEXT brain over SSE — it never sees
// raw media. So the edge must turn every attachment into text the agent can read,
// exactly like the standalone ghosty-gc does in-process (server.js dispatcher).
// Ported from ghosty-gc, RE-PATHED for Fly: ghosty calls box-internal services
// (whisper-svc / pdftotext at 172.20.0.1) which the Fly app can't reach, so here:
//   - images  → describeImageService (Gemini Flash, already in EasyBits)
//   - audio   → Gemini inline (transcription)
//   - video   → Gemini inline on the audio track... not reachable; we transcribe
//               the whole video via Gemini inline (it handles audio)
//   - PDF     → Gemini inline (text extraction); plain-text files decoded directly
//   - location/contact/poll/quoted → pure text conversion (copied verbatim)
// Inbound images are also uploaded to public storage so the agent gets a real URL
// it can pass to its image tools (the worker can't reach the edge's disk).
import {
  downloadMediaMessage,
  normalizeMessageContent,
  getContentType,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { describeImageService } from "~/.server/services/providers/describe";
import { getPlatformPublicClient, buildPublicAssetUrl } from "~/.server/storage";

const GEMINI_MODEL = process.env.WA_MEDIA_MODEL || "gemini-2.5-flash";
const geminiKey = () => process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

// Minimal pino-shaped logger so Baileys' downloadMediaMessage stays silent.
const silentLogger: any = { level: "silent", child: () => silentLogger };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silentLogger[m] = () => {};

export type InboundContent = {
  /** Composed prompt for the worker (media already turned into text). */
  text: string;
  /** The user's own words (typed text / transcript / caption), without framing. */
  userText: string;
  /** Public URL of an inbound image (so the agent can edit/reference it). */
  refImageUrl?: string;
  /** True when the user's message was a voice note (drives voice-reply choice). */
  wasVoice?: boolean;
};

function dl(sock: WASocket, m: WAMessage): Promise<Buffer> {
  return downloadMediaMessage(
    m,
    "buffer",
    {},
    { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }
  ) as Promise<Buffer>;
}

// One raw Gemini generateContent call with a single inline (base64) part. Used for
// audio transcription and PDF text — both unreachable via box services from Fly.
// Returns "" on missing key / any failure (caller degrades gracefully).
async function geminiInline(prompt: string, mimeType: string, data: string): Promise<string> {
  const key = geminiKey();
  if (!key) return "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }] };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return "";
    const d: any = await r.json();
    const text = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join(" ");
    return (text || "").trim();
  } catch {
    return "";
  }
}

const DOC_CAP = 12000;
const capDoc = (s: string) =>
  s.length > DOC_CAP
    ? s.slice(0, DOC_CAP) +
      `\n\n[…documento truncado: ${s.length} chars totales; pídele al usuario la sección específica que necesita.]`
    : s;

// Document → text. PDF via Gemini; plain-text formats decoded directly; binary
// office formats (docx/xlsx) return "" (agent is told it couldn't be read).
async function readDocText(buf: Buffer, fileName: string, mimetype?: string): Promise<string> {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName || "")?.[1] || "").toLowerCase();
  const isPdf = ext === "pdf" || /pdf/i.test(mimetype || "");
  if (isPdf) {
    const t = await geminiInline(
      "Extrae TODO el texto de este PDF en orden de lectura. Devuelve SOLO el texto, sin comentarios.",
      "application/pdf",
      buf.toString("base64")
    );
    return capDoc(t.replace(/\n{3,}/g, "\n\n").trim());
  }
  if (/^(txt|md|csv|json|log|tsv|xml|html?|yaml|yml)$/.test(ext)) return capDoc(buf.toString("utf8"));
  return "";
}

function quotedText(m: WAMessage): string {
  const q = (m.message as any)?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return "";
  const doc = q.documentMessage || q.documentWithCaptionMessage?.message?.documentMessage;
  if (doc) return `[el cliente está citando un documento: "${doc.fileName || doc.title || "documento"}".]`;
  return (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || "").trim();
}

// Turn an inbound WhatsApp message into the text prompt the worker should see.
// Returns null when there's nothing actionable (reaction/protocol noise) — the
// caller skips those. Mirrors ghosty-gc's messages.upsert dispatcher.
export async function extractInboundContent(
  sock: WASocket,
  m: WAMessage,
  opts: { ownerId: string }
): Promise<InboundContent | null> {
  const c: any = normalizeMessageContent(m.message!) || m.message;
  const docMsg = c.documentMessage;
  let text: string =
    c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || docMsg?.caption || "";
  const hadImage = !!(c.imageMessage || c.videoMessage || c.stickerMessage || docMsg);
  const prepend = (line: string) => {
    text = text ? line + "\n" + text : line;
  };

  // Location / contact / poll → text (verbatim from ghosty).
  const locMsg = c.locationMessage || c.liveLocationMessage;
  if (locMsg && typeof locMsg.degreesLatitude === "number") {
    const nm = c.locationMessage?.name;
    const addr = c.locationMessage?.address;
    const q = locMsg.degreesLatitude + "," + locMsg.degreesLongitude;
    prepend(
      `[${c.liveLocationMessage ? "Ubicación en vivo" : "Ubicación"}: ${q}]${nm ? ` "${nm}"` : ""}${addr ? " " + addr : ""} https://maps.google.com/?q=${q}`
    );
  }
  const contacts = c.contactsArrayMessage?.contacts || (c.contactMessage ? [c.contactMessage] : []);
  if (contacts.length) {
    prepend(
      contacts
        .map((ct: any) => {
          const tel = ((ct.vcard || "").match(/TEL[^:]*:([+\d][\d\s()-]+)/) || [])[1];
          return `[Contacto: ${ct.displayName || "contacto"}${tel ? ", tel: " + tel.trim() : ""}]`;
        })
        .join("\n")
    );
  }
  const poll = c.pollCreationMessage || c.pollCreationMessageV2 || c.pollCreationMessageV3;
  if (poll?.name) {
    const optionNames = (poll.options || []).map((o: any) => o.optionName).filter(Boolean);
    prepend(`[Encuesta: "${poll.name}"${optionNames.length ? " — opciones: " + optionNames.join(", ") : ""}]`);
  }

  // Voice note (only when there's no text) → transcribe.
  let wasVoice = false;
  if (!text.trim() && c.audioMessage) {
    try {
      const buf = await dl(sock, m);
      const mime = c.audioMessage.mimetype || "audio/ogg";
      const t = await geminiInline(
        "Transcribe este audio en español. Devuelve SOLO la transcripción, sin comentarios.",
        mime,
        buf.toString("base64")
      );
      if (t) {
        text = t;
        wasVoice = true;
      }
    } catch {}
  }

  // Video → transcribe its audio (Gemini reads the audio track).
  if (c.videoMessage) {
    try {
      const buf = await dl(sock, m);
      const mime = c.videoMessage.mimetype || "video/mp4";
      const vt = await geminiInline(
        "Transcribe el audio de este video en español. Devuelve SOLO lo que se dice, sin comentarios.",
        mime,
        buf.toString("base64")
      );
      if (vt) prepend(`[Video — audio transcrito: ${vt}]`);
    } catch {}
  }

  // Image / sticker → vision describe + upload to public storage for editing.
  let imgDesc = "";
  let refImageUrl: string | undefined;
  if (c.imageMessage || c.stickerMessage) {
    try {
      const buf = await dl(sock, m);
      const mime = c.imageMessage?.mimetype || c.stickerMessage?.mimetype || (c.stickerMessage ? "image/webp" : "image/jpeg");
      try {
        const res = await describeImageService.execute(
          { images: [{ data: new Uint8Array(buf), mediaType: mime }], question: text || undefined },
          { userId: opts.ownerId }
        );
        imgDesc = res.data.description;
      } catch {}
      try {
        const ext = /png/.test(mime) ? "png" : /webp/.test(mime) ? "webp" : "jpg";
        const key = `wa-media/${opts.ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await getPlatformPublicClient().putObject(key, buf, mime);
        refImageUrl = buildPublicAssetUrl(key);
      } catch {}
    } catch {}
  }

  // Document → extracted text.
  let docText = "";
  let docName = "";
  if (docMsg) {
    docName = docMsg.fileName || docMsg.title || "documento";
    try {
      const buf = await dl(sock, m);
      docText = await readDocText(buf, docName, docMsg.mimetype);
    } catch {}
  }

  // Anti-drop: never silently swallow an attachment — tell the agent what arrived.
  if (!text.trim() && !imgDesc && !docText) {
    const kind = (() => {
      try {
        return getContentType(c);
      } catch {
        return null;
      }
    })();
    const NOTE: Record<string, string> = {
      videoMessage: "un video sin audio reconocible",
      audioMessage: "una nota de voz",
      documentMessage: "un archivo que no pude leer",
      stickerMessage: "un sticker",
    };
    if (kind && NOTE[kind]) text = `(el usuario te envió ${NOTE[kind]} que no pude procesar; pídele que te lo describa o lo mande de otra forma)`;
    else if (hadImage) text = "(el usuario envió un archivo sin texto)";
    else return null; // reaction / protocol / key-distribution noise → skip
  }

  // The user's own words (before framing) — drives the voice-reply trigger.
  const userText = text;

  // Compose the final prompt (quoted context + media framing), like ghosty.
  const qt = quotedText(m);
  let agentPrompt = qt ? `[En respuesta al mensaje citado: "${qt}"]\n${text}` : text;
  if (imgDesc) {
    const urlNote = refImageUrl ? ` Su URL pública es ${refImageUrl} (pásala a tus tools de imagen si la vas a editar).` : "";
    agentPrompt =
      `[El usuario envió una IMAGEN.${urlNote} Tu visión la describe así: ${imgDesc}.]\n` +
      (text ? `Texto del usuario: ${text}` : "(sin texto adicional)");
  } else if (docText) {
    agentPrompt =
      `[El usuario envió el documento "${docName}". Contenido (texto extraído del archivo):\n${docText}\n---fin del documento---]\n` +
      (text ? `Mensaje del usuario: ${text}` : "(sin texto adicional)");
  } else if (hadImage && !refImageUrl) {
    agentPrompt = `[NOTA: el usuario adjuntó un archivo/imagen que NO puedes ver/leer. Pídele que lo describa o que te diga qué contiene.]\n${agentPrompt}`;
  }

  return { text: agentPrompt, userText, refImageUrl, wasVoice };
}
