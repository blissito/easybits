// Fleet voice — channel-agnostic STT/TTS for FleetAgents. NOT WhatsApp-specific:
// any channel (Baileys, WABA, web widget, Slack) uses these helpers, and they
// consume the on-demand voice-svc box (whisper STT + kokoro TTS) first, falling
// back to cloud providers (Gemini STT / ElevenLabs TTS) when the box isn't warm.
//
// Latency policy: the box cold-boots ~25s, so we never block a turn on it. We use
// the box only when it's ALREADY running (getServiceBox), and otherwise fall back
// to the cloud provider while warming the box in the background — so the next turn
// (within the idle window) hits the box. An active voice conversation keeps the
// box warm (each use refreshes lastActiveAt), which is exactly when dogfooding the
// box pays off.
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { getSecretValue } from "./secretOperations";
import { ensureServiceBox, getServiceBox, touchServiceBox } from "./fleetServiceOperations";

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

// Returns the owner's voice box ONLY if it's already running. Otherwise kicks a
// background spawn (idempotent) so the next turn can use it, and returns null so
// the caller falls back to the cloud provider this turn.
async function warmVoiceBox(ctx: AuthContext): Promise<{ transcribeUrl?: string; speakUrl?: string; sandboxId: string } | null> {
  const box = await getServiceBox(ctx, { kind: "voice" }).catch(() => null);
  if (box && box.status === "running") return box;
  if (!box) void ensureServiceBox(ctx, "voice").catch(() => {}); // warm for next turn
  return null;
}

// ── TTS ───────────────────────────────────────────────────────────────────────
const VOICE_ID = process.env.WA_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE || "EXAVITQu4vr4xnSDxMaL";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

async function resolveElevenKey(ownerId: string): Promise<string> {
  const own = await getSecretValue(ownerId, "ELEVENLABS_API_KEY").catch(() => null);
  return own || process.env.ELEVENLABS_API_KEY || "";
}

async function speakViaBox(speakUrl: string, text: string): Promise<{ buffer: Buffer; waveform?: string } | null> {
  try {
    // kokoro reads the RAW body as UTF-8 text (NOT JSON); format via query.
    const r = await fetch(`${speakUrl}?format=ogg_opus`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: text,
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    return { buffer: buf, waveform: r.headers.get("x-waveform") || undefined };
  } catch {
    return null;
  }
}

async function speakViaElevenLabs(text: string, ownerId: string): Promise<{ buffer: Buffer } | null> {
  const key = await resolveElevenKey(ownerId);
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/ogg" },
        body: JSON.stringify({ text: text.slice(0, 5000), model_id: MODEL }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length ? { buffer: buf } : null;
  } catch {
    return null;
  }
}

export interface SynthResult {
  buffer: Buffer;
  /** base64-encoded 64-byte amplitude waveform for WhatsApp PTT (box only). */
  waveform?: string;
  source: "box" | "elevenlabs";
}

// Synthesize an OGG/opus voice note. Box-first (when warm), ElevenLabs fallback.
// Returns null when neither is available (caller sends text instead).
export async function synthesizeVoice(ownerId: string, text: string): Promise<SynthResult | null> {
  const clean = stripForVoice(text);
  if (!clean) return null;
  const ctx = await ctxFor(ownerId);
  if (ctx) {
    const box = await warmVoiceBox(ctx);
    if (box?.speakUrl) {
      const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000));
      if (r) {
        void touchServiceBox(box.sandboxId);
        return { ...r, source: "box" };
      }
    }
  }
  const el = await speakViaElevenLabs(clean, ownerId);
  return el ? { buffer: el.buffer, source: "elevenlabs" } : null;
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
    const box = await warmVoiceBox(ctx);
    if (box?.transcribeUrl) {
      const t = await transcribeViaBox(box.transcribeUrl, audio);
      if (t) {
        void touchServiceBox(box.sandboxId);
        return t;
      }
    }
  }
  return transcribeViaGemini(audio, mimeType);
}
