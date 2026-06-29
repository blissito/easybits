// Inbound WhatsApp media → text, for the FleetAgent's Baileys edge.
//
// The fleetAgent's worker (claude-worker) is a pure TEXT brain over SSE — it never sees
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
import { randomBytes } from "node:crypto";
import { describeImageService } from "~/.server/services/providers/describe";
import { getPlatformDefaultClient } from "~/.server/storage";

const GEMINI_MODEL = process.env.WA_MEDIA_MODEL || "gemini-2.5-flash";
const geminiKey = () => process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

// The whole extraction runs inside Baileys' messages.upsert loop, so every fetch/
// download MUST be bounded — a hung media server or model call would otherwise
// stall message processing for that conversation.
const GEMINI_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
// Gemini inline (base64) request bodies are capped well under the API's ~20MB.
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

// Minimal pino-shaped logger so Baileys' downloadMediaMessage stays silent.
const silentLogger: any = { level: "silent", child: () => silentLogger };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silentLogger[m] = () => {};

export type InboundContent = {
  /** Composed prompt for the worker (media already turned into text). */
  text: string;
  /** The user's own words (typed text / transcript / caption), without framing. */
  userText: string;
  /** Signed (private, ~1h) URL of an inbound image so the agent can edit/reference it. */
  refImageUrl?: string;
  /** True when the user's message was a voice note (drives voice-reply choice). */
  wasVoice?: boolean;
  /** True when ANY non-text modality was present (image/doc/audio/video/etc) —
   *  even if its extraction failed. Drives the truthful `hasMedia` audit field. */
  hasMedia?: boolean;
  /** Raw inbound image bytes (base64) for NATIVE Claude vision: the fleetAgent writes
   *  this into the worker's FS so the agent's Read tool sees it — no Gemini middle
   *  step. `url` is the signed copy for editing/reusing with image tools. */
  image?: { base64: string; ext: string; url?: string };
};

function dl(sock: WASocket, m: WAMessage): Promise<Buffer> {
  return withTimeout(
    downloadMediaMessage(
      m,
      "buffer",
      {},
      { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }
    ) as Promise<Buffer>,
    DOWNLOAD_TIMEOUT_MS,
    "media download"
  );
}

// One raw Gemini generateContent call with a single inline (base64) part. Used for
// audio transcription and PDF text — both unreachable via box services from Fly.
// Returns "" on missing key / any failure (caller degrades gracefully).
async function geminiInline(prompt: string, mimeType: string, data: string): Promise<string> {
  const key = geminiKey();
  if (!key) return "";
  // Backstop size guard (base64 ≈ 1.33× bytes) so audio/video/PDF over the API's
  // inline limit degrade to "" instead of a failed call.
  if (data.length > MAX_INLINE_BYTES * 1.4) return "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }] };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
    if (buf.length > MAX_INLINE_BYTES) {
      return `[documento "${fileName}" demasiado grande para leer (${Math.round(buf.length / 1024 / 1024)}MB); pídele al usuario la sección específica o una versión más chica.]`;
    }
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

// ContextInfo (the reply/quote metadata) can hang off ANY message type, not just
// extendedTextMessage — so a quote sent ALONGSIDE an image/doc isn't lost.
function getContextInfo(c: any): any {
  return (
    c?.extendedTextMessage?.contextInfo ||
    c?.imageMessage?.contextInfo ||
    c?.videoMessage?.contextInfo ||
    c?.documentMessage?.contextInfo ||
    c?.audioMessage?.contextInfo ||
    c?.stickerMessage?.contextInfo ||
    null
  );
}

// Plain-text fallback for a quoted message (caption / filename / body).
function quotedPlainText(qm: any): string {
  if (!qm) return "";
  const doc = qm.documentMessage || qm.documentWithCaptionMessage?.message?.documentMessage;
  if (doc) return `[el cliente está citando un documento: "${doc.fileName || doc.title || "documento"}".]`;
  return (qm.conversation || qm.extendedTextMessage?.text || qm.imageMessage?.caption || qm.videoMessage?.caption || "").trim();
}

// Resolve the QUOTED message into rich context. If it's an image/doc, RE-DOWNLOAD
// and re-describe/extract it (Baileys can fetch a quoted stub) so "edita esta
// imagen [citada]" / "resume este PDF [citado]" actually work — not just the
// caption. Best-effort + bounded; falls back to the quoted plain text.
async function resolveQuotedContext(
  sock: WASocket,
  m: WAMessage,
  ownerId: string
): Promise<{ frame: string; refImageUrl?: string }> {
  const ctx = getContextInfo(normalizeMessageContent(m.message!) || m.message);
  const qm = ctx?.quotedMessage ? normalizeMessageContent(ctx.quotedMessage) || ctx.quotedMessage : null;
  if (!qm) return { frame: "" };
  // Fake WAMessage so downloadMediaMessage can fetch the quoted media stub.
  const fake = {
    key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false },
    message: qm,
  } as WAMessage;

  // Quoted image/sticker → describe + signed URL (so the agent can edit/reuse it).
  if (qm.imageMessage || qm.stickerMessage) {
    try {
      const buf = await dl(sock, fake);
      const mime = qm.imageMessage?.mimetype || qm.stickerMessage?.mimetype || "image/jpeg";
      let desc = "";
      try {
        const res = await describeImageService.execute(
          { images: [{ data: new Uint8Array(buf), mediaType: mime }] },
          { userId: ownerId }
        );
        desc = res.data.description;
      } catch {}
      let url: string | undefined;
      try {
        const ext = /png/.test(mime) ? "png" : /webp/.test(mime) ? "webp" : "jpg";
        const key = `wa-media/${ownerId}/${Date.now()}-${randomBytes(16).toString("hex")}.${ext}`;
        const client = getPlatformDefaultClient();
        await client.putObject(key, buf, mime);
        url = await client.getReadUrl(key, 3600);
      } catch {}
      if (desc || url) {
        return {
          frame:
            `[El usuario está CITANDO una imagen anterior.` +
            `${url ? ` Su URL es ${url} (pásala a tus tools de imagen si te pide editarla/reusarla).` : ""}` +
            `${desc ? ` Tu visión la describe así: ${desc}.` : ""}]`,
          refImageUrl: url,
        };
      }
    } catch {}
  }

  // Quoted voice note / audio → transcribe it (box-first whisper, Gemini fallback).
  // Without this, replying to a voice note with "escucha el audio…" reached the
  // agent with NO transcript → "no recibí ningún audio".
  if (qm.audioMessage) {
    try {
      const buf = await dl(sock, fake);
      const mime = qm.audioMessage.mimetype || "audio/ogg";
      const { transcribeAudio } = await import("~/.server/core/fleetVoice");
      const t = await transcribeAudio(ownerId, buf, mime);
      if (t) return { frame: `[El usuario CITA una nota de voz. Transcripción: "${t}"]` };
    } catch {}
  }

  // Quoted document → extract its text.
  const qdoc = qm.documentMessage || qm.documentWithCaptionMessage?.message?.documentMessage;
  if (qdoc) {
    try {
      const buf = await dl(sock, fake);
      const name = qdoc.fileName || qdoc.title || "documento";
      const dtext = await readDocText(buf, name, qdoc.mimetype);
      if (dtext) return { frame: `[El usuario CITA el documento "${name}". Contenido:\n${dtext}\n---fin del documento citado---]` };
    } catch {}
  }

  // Fallback: quoted plain text / caption.
  const qt = quotedPlainText(qm);
  return { frame: qt ? `[En respuesta al mensaje citado: "${qt}"]` : "" };
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

  // ── Forward/wrapper diagnostics (FLEET_AUDIT_LOG=1) ──────────────────────────
  // A forwarded captioned image was reaching the worker as TEXT ONLY (no vision
  // framing) — i.e. `c.imageMessage` undefined. Log the raw vs normalized shape
  // so we can see whether the media node is in a wrapper normalizeMessageContent
  // misses, or arrives split. Off unless the flag is set.
  if (process.env.FLEET_AUDIT_LOG === "1") {
    let kind: string | undefined;
    try {
      kind = getContentType(c);
    } catch {}
    const ci = getContextInfo(c);
    console.log(
      `[fleet-audit] inbound.raw ${JSON.stringify({
        rawKeys: Object.keys(m.message ?? {}),
        normKeys: Object.keys(c ?? {}),
        kind,
        isForwarded: !!ci?.isForwarded,
        forwardingScore: ci?.forwardingScore ?? 0,
        hasQuoted: !!ci?.quotedMessage,
      })}`
    );
  }

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

  // Voice note (only when there's no text) → transcribe via the channel-agnostic
  // fleet voice layer (box-first whisper, Gemini fallback).
  let wasVoice = false;
  if (!text.trim() && c.audioMessage) {
    try {
      const buf = await dl(sock, m);
      const mime = c.audioMessage.mimetype || "audio/ogg";
      const { transcribeAudio } = await import("~/.server/core/fleetVoice");
      const t = await transcribeAudio(opts.ownerId, buf, mime);
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

  // Image / sticker → NATIVE Claude vision. We download the bytes and hand them
  // (base64) to the fleetAgent, which writes them onto the worker's disk so the agent's
  // Read tool SEES the image — no Gemini describe middle step (Claude is already
  // multimodal). We also stash a short-lived SIGNED url so the agent can edit/reuse
  // it with image tools (the user's photo must NOT land in a public bucket).
  let imgDesc = ""; // legacy: solo se llena para imágenes CITADAS (resolveQuotedContext)
  let refImageUrl: string | undefined;
  let imageData: { base64: string; ext: string; url?: string } | undefined;
  if (c.imageMessage || c.stickerMessage) {
    try {
      const buf = await dl(sock, m);
      const mime = c.imageMessage?.mimetype || c.stickerMessage?.mimetype || (c.stickerMessage ? "image/webp" : "image/jpeg");
      const ext = /png/.test(mime) ? "png" : /webp/.test(mime) ? "webp" : "jpg";
      imageData = { base64: buf.toString("base64"), ext };
      try {
        // 16 bytes of entropy in the key — not guessable even if the bucket leaked.
        const key = `wa-media/${opts.ownerId}/${Date.now()}-${randomBytes(16).toString("hex")}.${ext}`;
        const client = getPlatformDefaultClient();
        await client.putObject(key, buf, mime);
        refImageUrl = await client.getReadUrl(key, 3600); // signed, ~1h
        imageData.url = refImageUrl;
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

  // Quoted/replied context — resolved BEFORE anti-drop so a reply to media still
  // produces content. Re-fetches the quoted image/doc when present.
  const quoted = await resolveQuotedContext(sock, m, opts.ownerId);
  if (quoted.refImageUrl && !refImageUrl) refImageUrl = quoted.refImageUrl;

  // Anti-drop: never silently swallow an attachment — tell the agent what arrived.
  if (!text.trim() && !imgDesc && !docText && !quoted.frame && !imageData) {
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

  // Compose the final prompt: media framing first, then prepend quoted context
  // (so a quote accompanying a NEW attachment is preserved, not overwritten).
  let agentPrompt = text;
  // Imagen NUEVA (con bytes) → la enmarca routeMessage tras escribirla en el FS del
  // worker (Claude la ve nativo con Read). Aquí solo enmarcamos imágenes CITADAS
  // (quoted): no traen bytes, pero sí descripción/URL vía resolveQuotedContext.
  if (!imageData && (imgDesc || refImageUrl)) {
    const urlNote = refImageUrl ? ` Su URL es ${refImageUrl} (pásala a tus tools de imagen/visión para verla o editarla).` : "";
    const visionNote = imgDesc ? ` Tu visión la describe así: ${imgDesc}.` : "";
    agentPrompt =
      `[El usuario citó una IMAGEN.${urlNote}${visionNote}]\n` +
      (text ? `Texto del usuario: ${text}` : "(sin texto adicional)");
  } else if (docText) {
    agentPrompt =
      `[El usuario envió el documento "${docName}". Contenido (texto extraído del archivo):\n${docText}\n---fin del documento---]\n` +
      (text ? `Mensaje del usuario: ${text}` : "(sin texto adicional)");
  } else if (hadImage && !refImageUrl) {
    agentPrompt = `[NOTA: el usuario adjuntó un archivo/imagen que NO puedes ver/leer. Pídele que lo describa o que te diga qué contiene.]\n${agentPrompt}`;
  }
  // Quoted context on top — works alongside a new attachment.
  if (quoted.frame) agentPrompt = `${quoted.frame}\n${agentPrompt}`;

  // Truthful media flag: ANY non-text modality was present, regardless of whether
  // its extraction succeeded (so a forward whose image we failed to read still
  // reads as hasMedia:true in the audit, not a misleading false).
  const hasMedia =
    hadImage || wasVoice || !!c.audioMessage || !!c.videoMessage || !!locMsg || contacts.length > 0 || !!poll;

  return { text: agentPrompt, userText, refImageUrl, wasVoice, hasMedia, image: imageData };
}

// ── WABA channel (Formmy gateway) ────────────────────────────────────────────
// Unlike Baileys, the WABA edge never holds a socket or raw encrypted media:
// Formmy already downloaded the attachment from Meta, re-hosted it on EasyBits,
// and forwards a single { type, url, mime_type, caption } object alongside the
// text. So instead of downloadMediaMessage we just fetch(url) and reuse the SAME
// per-type helpers (geminiInline / readDocText / transcribeAudio) the Baileys path
// uses — keeping ONE media brain, two edges.
export type WabaInboundMedia = {
  type: string; // image | audio | video | document | sticker
  url: string; // signed EasyBits read URL (already hosted; ~1h)
  mimeType?: string;
  caption?: string;
  fileName?: string;
};

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

// Bounded fetch of a media URL → Buffer. Formmy reenvía la media como su PROXY
// (`formmy.app/api/v1/integrations/whatsapp/media/...`), que exige `Authorization:
// Bearer <formmySecret>` → sin él da 401. Para URLs de Formmy: añade el bearer y
// reescribe el apex (formmy.app) a www (el apex falla TLS desde Fly).
async function fetchMedia(url: string, formmySecret?: string): Promise<Buffer> {
  let target = url;
  const headers: Record<string, string> = {};
  if (/\/\/(www\.)?formmy\.app\//i.test(url)) {
    target = url.replace(/\/\/formmy\.app\//i, "//www.formmy.app/");
    if (formmySecret) headers.Authorization = `Bearer ${formmySecret}`;
  }
  const r = await withTimeout(
    fetch(target, { redirect: "follow", headers }) as Promise<Response>,
    DOWNLOAD_TIMEOUT_MS,
    "waba media fetch"
  );
  if (!r.ok) throw new Error(`media fetch ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX_MEDIA_BYTES) throw new Error("media empty or too large");
  return buf;
}

function extFromMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (/png/.test(m)) return "png";
  if (/webp/.test(m)) return "webp";
  if (/pdf/.test(m)) return "pdf";
  if (/(jpe?g)/.test(m)) return "jpg";
  const sub = m.split("/")[1]?.split(";")[0];
  return (sub || "bin").replace(/[^a-z0-9]/g, "") || "bin";
}

export async function extractWabaContent(
  textContent: string,
  media: WabaInboundMedia | null,
  opts: { ownerId: string; formmySecret?: string }
): Promise<InboundContent> {
  // The user's typed words (or media caption). For a voice note it's replaced by
  // the transcript below (drives the voice-reply trigger, like Baileys).
  let userWords = (textContent || media?.caption || "").trim();
  let text = userWords;
  let wasVoice = false;
  let imageData: { base64: string; ext: string; url?: string } | undefined;
  let hasMedia = false;

  if (media?.url) {
    hasMedia = true;
    const type = media.type;
    const mime = media.mimeType || "";
    try {
      const buf = await fetchMedia(media.url, opts.formmySecret);
      if (type === "image" || type === "sticker") {
        // Native Claude vision: base64 bytes for the worker FS. Re-subimos a storage
        // de EasyBits para una signed URL LIMPIA (la de Formmy es un proxy con auth →
        // las tools de imagen del agente darían 401). Igual que el path de baileys.
        const ext = extFromMime(mime || "image/jpeg");
        imageData = { base64: buf.toString("base64"), ext };
        try {
          const key = `wa-media/${opts.ownerId}/${Date.now()}-${randomBytes(16).toString("hex")}.${ext}`;
          const client = getPlatformDefaultClient();
          await client.putObject(key, buf, mime || "image/jpeg");
          imageData.url = await client.getReadUrl(key, 3600);
        } catch {}
      } else if (type === "audio") {
        const { transcribeAudio } = await import("~/.server/core/fleetVoice");
        const t = await transcribeAudio(opts.ownerId, buf, mime || "audio/ogg");
        if (t) {
          text = t;
          userWords = t;
          wasVoice = true;
        }
      } else if (type === "video") {
        const vt = await geminiInline(
          "Transcribe el audio de este video en español. Devuelve SOLO lo que se dice, sin comentarios.",
          mime || "video/mp4",
          buf.toString("base64")
        );
        if (vt) text = text ? `[Video — audio transcrito: ${vt}]\n${text}` : `[Video — audio transcrito: ${vt}]`;
      } else if (type === "document") {
        const name = media.fileName || `documento.${extFromMime(mime)}`;
        const dtext = await readDocText(buf, name, mime);
        text = dtext
          ? `[El usuario envió el documento "${name}". Contenido (texto extraído del archivo):\n${dtext}\n---fin del documento---]\n${text || "(sin texto adicional)"}`
          : `[NOTA: el usuario adjuntó el documento "${name}" que NO pude leer. Pídele que te diga qué contiene o que lo mande como PDF/CSV.]\n${text}`;
      }
    } catch (e) {
      console.error(`[waba] media extract (${type}) failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Anti-drop: a media-only message we couldn't process still tells the agent.
  if (!text.trim()) {
    text = hasMedia
      ? "(el usuario envió un archivo que no pude procesar; pídele que lo describa o lo mande de otra forma)"
      : "";
  }

  return { text, userText: userWords, refImageUrl: imageData?.url, wasVoice, hasMedia, image: imageData };
}
