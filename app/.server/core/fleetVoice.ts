// Fleet voice — channel-agnostic STT/TTS for FleetAgents. NOT WhatsApp-specific:
// any channel (Baileys, WABA, web widget, Slack) uses these helpers, and they
// consume the on-demand voice-svc box (whisper STT + kokoro TTS).
//
// Policy: kokoro/whisper (the box) is ALWAYS primary. NO ElevenLabs. Fallbacks
// are OpenAI (TTS) and Gemini (STT), used ONLY when the box can't be brought up
// or its call fails. We ensureServiceBox (spawning + waiting on the ~25s cold
// boot if needed) and use the box; the box stays warm for the idle window and
// each use refreshes lastActiveAt, so a conversation only pays the cold boot once.
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { ensureServiceBox, touchServiceBox } from "./fleetServiceOperations";

// ── Voice-reply decision (moved verbatim from whatsappVoice.server.ts) ─────────
function voiceRepliesEnabled(): boolean {
  return process.env.WA_VOICE_REPLIES !== "0";
}

export function wantsVoiceReply(userText: string, wasVoice: boolean): boolean {
  if (!voiceRepliesEnabled()) return false;
  const wantsText =
    /\bno\b[^.!?]*\b(voz|audio)\b|\b(sin|nada de)\s+(voz|audio)\b|\b(en|por|con|de)\s+texto\b|\bescr[ií]b[ea]\w*\b|\bescrito\b/i.test(
      userText
    );
  if (wantsText) return false;
  return wasVoice || /\b(audio|voz|vo[sz]|h[aá]blame|esc[uú]cha\w*|en voz|con (tu )?voz)\b/i.test(userText);
}

// Strip markdown so it isn't read aloud literally.
function stripForVoice(t: string): string {
  return t
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Background AuthContext for the owner — voice helpers run inside channel loops,
// not HTTP requests. Mirrors ctxForServiceOwner.
async function ctxFor(ownerId: string): Promise<AuthContext | null> {
  if (!ownerId) return null;
  const user = await db.user.findUnique({ where: { id: ownerId } });
  return user ? { user, scopes: ["READ", "WRITE", "DELETE"] } : null;
}

// Brings up the owner's voice box (spawning + waiting on the cold boot if needed)
// and returns it running. Returns null only if the box genuinely can't be brought
// up (host down, plan cap, etc.) — that's the ONLY case where callers fall back to
// the cloud provider.
async function ensureBox(ctx: AuthContext): Promise<{ transcribeUrl?: string; speakUrl?: string; sandboxId: string } | null> {
  return ensureServiceBox(ctx, "voice").catch((e) => {
    console.error("[voice] ensureBox FAILED → cloud fallback:", (e as Error)?.message || e);
    return null;
  });
}

// ── TTS ───────────────────────────────────────────────────────────────────────
// Audio formats: "ogg" → WhatsApp PTT (ogg/opus); "wav" → a File for the avatar
// pipeline. kokoro takes `format=ogg_opus|wav`. SIN proveedores externos.
type VoiceFmt = "ogg" | "wav";

async function speakViaBox(speakUrl: string, text: string, fmt: VoiceFmt): Promise<{ buffer: Buffer; waveform?: string; contentType: string } | null> {
  try {
    // kokoro reads the RAW body as UTF-8 text (NOT JSON); format via query.
    const q = fmt === "ogg" ? "?format=ogg_opus" : "?format=wav";
    const r = await fetch(`${speakUrl}${q}`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: text,
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) { console.error(`[voice] speakViaBox http=${r.status} url=${speakUrl}`); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) { console.error("[voice] speakViaBox empty body"); return null; }
    return {
      buffer: buf,
      waveform: r.headers.get("x-waveform") || undefined,
      contentType: fmt === "ogg" ? "audio/ogg" : "audio/wav",
    };
  } catch (e) {
    console.error(`[voice] speakViaBox fetch FAILED url=${speakUrl}:`, (e as Error)?.message || e);
    return null;
  }
}

export interface SynthResult {
  buffer: Buffer;
  /** base64-encoded 64-byte amplitude waveform for WhatsApp PTT (kokoro only;
   *  OpenAI fallback omits it → Baileys derives it via `audio-decode`). */
  waveform?: string;
  source: "box";
}

// Synthesize an OGG/opus voice note for WhatsApp PTT. kokoro box PRIMARY, OpenAI
// fallback. Returns null when neither works (caller sends text instead).
export async function synthesizeVoice(ownerId: string, text: string): Promise<SynthResult | null> {
  const clean = stripForVoice(text);
  if (!clean) return null;
  const ctx = await ctxFor(ownerId);
  if (ctx) {
    const box = await ensureBox(ctx);
    if (box?.speakUrl) {
      const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000), "ogg");
      if (r) {
        void touchServiceBox(box.sandboxId);
        return { buffer: r.buffer, waveform: r.waveform, source: "box" };
      }
    }
  }
  // SIN fallback OpenAI (decisión del dueño: kokoro o nada). Si la caja no dio
  // audio, devolvemos null → el canal responde en TEXTO. NUNCA OpenAI/ElevenLabs.
  console.warn("[voice] synthesizeVoice: box dio null → respuesta en TEXTO (sin fallback)");
  return null;
}

// For the voice_tts_create MCP tool: synthesize a WAV and upload it to the owner's
// Files, returning a public audioUrl (feeds avatar_video_create). kokoro ONLY —
// SIN fallback OpenAI (decisión del dueño). Throws si la caja no produce audio.
export async function synthesizeVoiceFile(
  ctx: AuthContext,
  text: string,
  opts?: { isPublic?: boolean }
): Promise<{ fileId: string; audioUrl: string; source: "box"; chars: number }> {
  const clean = stripForVoice(text);
  if (!clean) throw new Error("empty text");
  const source = "box" as const;
  console.warn(`[voice] voice_tts_create llamado (kokoro-only) chars=${clean.length}`);

  let audio: { buffer: Buffer; contentType: string } | null = null;
  const box = await ensureBox(ctx);
  if (box?.speakUrl) {
    const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000), "wav");
    if (r) {
      void touchServiceBox(box.sandboxId);
      audio = { buffer: r.buffer, contentType: r.contentType };
    }
  }
  if (!audio) throw new Error("voice synthesis failed (kokoro box unavailable; sin fallback)");

  const { uploadFile } = await import("./operations");
  const fileName = `voz-${clean.slice(0, 24).replace(/[^\w]+/g, "-")}.wav`;
  const { file, putUrl } = await uploadFile(ctx, {
    fileName,
    contentType: audio.contentType,
    size: audio.buffer.length,
    access: opts?.isPublic === false ? "private" : "public",
    source: "voice_tts",
  });
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": audio.contentType },
    body: new Uint8Array(audio.buffer),
  });
  if (!put.ok) throw new Error(`audio upload failed: ${put.status}`);
  return { fileId: file.id, audioUrl: file.url || "", source, chars: clean.length };
}

// Back-compat shim for callers that only need the buffer (Baileys edge).
export async function synthesizeVoiceOgg(text: string, ownerId: string): Promise<Buffer | null> {
  const r = await synthesizeVoice(ownerId, text);
  return r?.buffer ?? null;
}

// ── STT ─────────────────────────────────────────────────────────────────────
const GEMINI_MODEL = process.env.WA_MEDIA_MODEL || "gemini-2.5-flash";
const geminiKey = () => process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

async function transcribeViaBox(transcribeUrl: string, audio: Buffer): Promise<string> {
  try {
    const r = await fetch(`${transcribeUrl}?lang=es`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return "";
    const d: any = await r.json().catch(() => null);
    return (d?.text || "").trim();
  } catch {
    return "";
  }
}

async function transcribeViaGemini(audio: Buffer, mimeType: string): Promise<string> {
  const key = geminiKey();
  if (!key || audio.length > MAX_INLINE_BYTES) return "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [
      {
        parts: [
          { text: "Transcribe este audio en español. Devuelve SOLO la transcripción, sin comentarios." },
          { inlineData: { mimeType, data: audio.toString("base64") } },
        ],
      },
    ],
  };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return "";
    const d: any = await r.json();
    const text = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join(" ");
    return (text || "").trim();
  } catch {
    return "";
  }
}

// Transcribe an inbound voice note. Box-first (when warm), Gemini fallback.
// Returns "" when neither produces text (caller treats the message as empty).
export async function transcribeAudio(ownerId: string, audio: Buffer, mimeType: string): Promise<string> {
  const ctx = await ctxFor(ownerId);
  if (ctx) {
    const box = await ensureBox(ctx);
    if (box?.transcribeUrl) {
      const t = await transcribeViaBox(box.transcribeUrl, audio);
      if (t) {
        void touchServiceBox(box.sandboxId);
        return t;
      }
    }
  }
  // Fallback ONLY when the box couldn't be used.
  return transcribeViaGemini(audio, mimeType);
}
