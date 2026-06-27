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
  return ensureServiceBox(ctx, "voice").catch(() => null);
}

// ── TTS ───────────────────────────────────────────────────────────────────────
// Audio formats: "ogg" → WhatsApp PTT (ogg/opus); "wav" → a File for the avatar
// pipeline. kokoro takes `format=ogg_opus|wav`; OpenAI takes `response_format`.
type VoiceFmt = "ogg" | "wav";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

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
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    return {
      buffer: buf,
      waveform: r.headers.get("x-waveform") || undefined,
      contentType: fmt === "ogg" ? "audio/ogg" : "audio/wav",
    };
  } catch {
    return null;
  }
}

// Fallback ONLY. OpenAI TTS returns opus (ogg container) or wav directly — no
// transcode needed (the Fly app has no ffmpeg). Gemini TTS returns raw PCM and
// would need transcoding in the box; deferred.
async function speakViaOpenAI(text: string, fmt: VoiceFmt): Promise<{ buffer: Buffer; contentType: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        input: text.slice(0, 4000),
        response_format: fmt === "ogg" ? "opus" : "wav",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length ? { buffer: buf, contentType: fmt === "ogg" ? "audio/ogg" : "audio/wav" } : null;
  } catch {
    return null;
  }
}

export interface SynthResult {
  buffer: Buffer;
  /** base64-encoded 64-byte amplitude waveform for WhatsApp PTT (kokoro only;
   *  OpenAI fallback omits it → Baileys derives it via `audio-decode`). */
  waveform?: string;
  source: "box" | "openai";
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
  const oa = await speakViaOpenAI(clean, "ogg");
  return oa ? { buffer: oa.buffer, source: "openai" } : null;
}

// For the voice_tts_create MCP tool: synthesize a WAV and upload it to the owner's
// Files, returning a public audioUrl (feeds avatar_video_create). kokoro PRIMARY,
// OpenAI fallback. Throws if neither produces audio.
export async function synthesizeVoiceFile(
  ctx: AuthContext,
  text: string,
  opts?: { isPublic?: boolean }
): Promise<{ fileId: string; audioUrl: string; source: "box" | "openai"; chars: number }> {
  const clean = stripForVoice(text);
  if (!clean) throw new Error("empty text");
  let audio: { buffer: Buffer; contentType: string } | null = null;
  let source: "box" | "openai" = "box";

  const box = await ensureBox(ctx);
  if (box?.speakUrl) {
    const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000), "wav");
    if (r) {
      void touchServiceBox(box.sandboxId);
      audio = { buffer: r.buffer, contentType: r.contentType };
    }
  }
  if (!audio) {
    const oa = await speakViaOpenAI(clean, "wav");
    if (oa) { audio = oa; source = "openai"; }
  }
  if (!audio) throw new Error("voice synthesis failed (box + OpenAI both unavailable)");

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
