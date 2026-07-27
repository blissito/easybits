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

// Voz kokoro por defecto. El default del box es `ef_dora` (femenina); forzamos
// `em_santa` (masculina) como default de la flota. Override con KOKORO_VOICE.
// Voces kokoro: ef_dora (F), em_alex / em_santa (M).
export const KOKORO_VOICE = process.env.KOKORO_VOICE || "em_santa";

// Voces kokoro español del box (servicio doble vía: STT whisper + TTS kokoro;
// esto SOLO aplica al TTS). Lista estática hasta tener /voices dinámico en la caja.
export const KOKORO_VOICES = [
  { id: "em_santa", label: "Santa (masculina)", gender: "M" },
  { id: "em_alex", label: "Alex (masculina)", gender: "M" },
  { id: "ef_dora", label: "Dora (femenina)", gender: "F" },
] as const;

function resolveVoice(voice?: string): string {
  if (voice && KOKORO_VOICES.some((v) => v.id === voice)) return voice;
  return KOKORO_VOICE;
}

async function speakViaBox(speakUrl: string, text: string, fmt: VoiceFmt, voice?: string): Promise<{ buffer: Buffer; waveform?: string; contentType: string } | null> {
  try {
    // kokoro reads the RAW body as UTF-8 text (NOT JSON); format + voice via query.
    const q = (fmt === "ogg" ? "?format=ogg_opus" : "?format=wav") + `&voice=${encodeURIComponent(resolveVoice(voice))}`;
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

// ─── ElevenLabs (voz premium, opt-in por canal) ──────────────────────────────
//
// Hermana de speakViaBox. Se usa SOLO si el canal tiene la capacidad `elevenlabs`
// encendida y su llave en el vault; si falla por lo que sea (sin saldo, 401, timeout,
// formato no soportado) devuelve null y el llamador cae a kokoro — el cliente nunca se
// queda sin su nota de voz por un problema de facturación.
const ELEVEN_URL = "https://api.elevenlabs.io";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const ELEVEN_FALLBACK_VOICE = process.env.ELEVENLABS_DEFAULT_VOICE || "EXAVITQu4vr4xnSDxMaL";

async function speakViaElevenLabs(
  apiKey: string,
  text: string,
  voiceId: string,
  fmt: VoiceFmt
): Promise<Buffer | null> {
  try {
    // ⚠️ opus_48000_64 NO es opcional para una nota de voz: las dos superficies mandan
    // `audio/ogg; codecs=opus` (wabaSend.ts, baileys.server.ts). Un mp3 llegaría a
    // WhatsApp como archivo adjunto en vez de burbuja de voz. Si la cuenta no puede dar
    // opus, preferimos caer a kokoro.
    const outFmt = fmt === "ogg" ? "opus_48000_64" : "pcm_24000";
    const r = await fetch(
      `${ELEVEN_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outFmt}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/ogg" },
        body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
        signal: AbortSignal.timeout(25_000),
      }
    );
    if (!r.ok) {
      console.error(`[voice] elevenlabs http=${r.status} voice=${voiceId} → cae a kokoro`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) { console.error("[voice] elevenlabs body vacío → cae a kokoro"); return null; }
    return buf;
  } catch (e) {
    console.error("[voice] elevenlabs FAILED → cae a kokoro:", (e as Error)?.message || e);
    return null;
  }
}

export type VoiceEngine =
  | { engine: "elevenlabs"; apiKey: string; voiceId: string }
  | { engine: "kokoro"; voice?: string };

/** ¿Qué motor le toca a este canal? Se apoya en resolveGroupCodeCaps, que ya resuelve la
 *  herencia del default `"*"` y ya aplica "falta el secret ⇒ la capacidad no cuenta".
 *  Sin fleetAgentId/cfgId (llamadas viejas) → kokoro, idéntico a como estaba. */
export async function resolveVoiceEngine(
  ownerId: string,
  opts?: { fleetAgentId?: string; cfgId?: string; voice?: string }
): Promise<VoiceEngine> {
  const { fleetAgentId, cfgId } = opts ?? {};
  if (!fleetAgentId || !cfgId) return { engine: "kokoro", voice: opts?.voice };
  try {
    const [{ db }, { resolveGroupCodeCaps }] = await Promise.all([
      import("~/.server/db"),
      import("./fleetAgentOperations"),
    ]);
    const fa = await db.fleetAgent.findUnique({
      where: { id: fleetAgentId },
      select: { mcpCatalog: true, groupConfigs: true },
    });
    if (!fa) return { engine: "kokoro", voice: opts?.voice };
    const caps = await resolveGroupCodeCaps(fa as never, cfgId, ownerId);
    const apiKey = caps?.env?.ELEVENLABS_API_KEY;
    if (!apiKey) return { engine: "kokoro", voice: opts?.voice };
    return {
      engine: "elevenlabs",
      apiKey,
      // La voz elegida en el admin vive en GroupConfig.env (por canal, heredando de "*").
      voiceId: opts?.voice || caps.env.ELEVENLABS_VOICE_ID || ELEVEN_FALLBACK_VOICE,
    };
  } catch (e) {
    console.error("[voice] resolveVoiceEngine falló → kokoro:", (e as Error)?.message || e);
    return { engine: "kokoro", voice: opts?.voice };
  }
}

export interface SynthResult {
  buffer: Buffer;
  /** base64-encoded 64-byte amplitude waveform for WhatsApp PTT (kokoro only;
   *  OpenAI fallback omits it → Baileys derives it via `audio-decode`). */
  waveform?: string;
  source: "box" | "elevenlabs";
}

// Synthesize an OGG/opus voice note for WhatsApp PTT. kokoro box PRIMARY, OpenAI
// fallback. Returns null when neither works (caller sends text instead).
export async function synthesizeVoice(
  ownerId: string,
  text: string,
  opts?: { voice?: string; fleetAgentId?: string; cfgId?: string }
): Promise<SynthResult | null> {
  const clean = stripForVoice(text);
  if (!clean) return null;
  // Motor premium primero si el canal lo tiene encendido. ElevenLabs no devuelve waveform
  // (baileys la deriva con audio-decode; WhatsApp dibuja barra plana si no).
  const eng = await resolveVoiceEngine(ownerId, opts);
  if (eng.engine === "elevenlabs") {
    const buf = await speakViaElevenLabs(eng.apiKey, clean.slice(0, 5000), eng.voiceId, "ogg");
    if (buf) {
      console.log(`[voice] source=elevenlabs voice=${eng.voiceId} bytes=${buf.length}`);
      return { buffer: buf, source: "elevenlabs" };
    }
    // sin return: cae a kokoro abajo
  }
  const ctx = await ctxFor(ownerId);
  if (ctx) {
    const box = await ensureBox(ctx);
    if (box?.speakUrl) {
      const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000), "ogg", opts?.voice);
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
/** Duration in seconds of a canonical PCM WAV buffer (0 if not parseable). */
function wavDurationSec(buf: Buffer): number {
  try {
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return 0;
    const channels = buf.readUInt16LE(22) || 1;
    const sampleRate = buf.readUInt32LE(24) || 0;
    const bits = buf.readUInt16LE(34) || 16;
    if (!sampleRate) return 0;
    // Find the "data" chunk size; fall back to (fileSize - 44).
    let dataSize = buf.length - 44;
    for (let i = 12; i + 8 <= buf.length; ) {
      const id = buf.toString("ascii", i, i + 4);
      const sz = buf.readUInt32LE(i + 4);
      if (id === "data") { dataSize = sz; break; }
      i += 8 + sz + (sz % 2);
    }
    const bytesPerSec = sampleRate * channels * (bits / 8);
    return bytesPerSec ? dataSize / bytesPerSec : 0;
  } catch {
    return 0;
  }
}

export async function synthesizeVoiceFile(
  ctx: AuthContext,
  text: string,
  opts?: { isPublic?: boolean; voice?: string; format?: VoiceFmt; fleetAgentId?: string; cfgId?: string }
): Promise<{ fileId: string; audioUrl: string; source: "box" | "elevenlabs"; voice: string; chars: number; durationSec: number }> {
  const clean = stripForVoice(text);
  if (!clean) throw new Error("empty text");
  const fmt: VoiceFmt = opts?.format ?? "wav";

  // Mismo criterio que la nota de voz del canal: si el canal tiene ElevenLabs encendido,
  // el audio que el agente pide a propósito también sale con la voz premium.
  let audio: { buffer: Buffer; contentType: string } | null = null;
  let source: "box" | "elevenlabs" = "box";
  let voice = resolveVoice(opts?.voice);
  const eng = await resolveVoiceEngine(ctx.user.id, { fleetAgentId: opts?.fleetAgentId, cfgId: opts?.cfgId, voice: opts?.voice });
  if (eng.engine === "elevenlabs") {
    const buf = await speakViaElevenLabs(eng.apiKey, clean.slice(0, 5000), eng.voiceId, fmt);
    if (buf) {
      audio = { buffer: buf, contentType: fmt === "ogg" ? "audio/ogg" : "audio/wav" };
      source = "elevenlabs";
      voice = eng.voiceId;
    }
  }
  console.warn(`[voice] voice_tts_create source=${source} voice=${voice} fmt=${fmt} chars=${clean.length}`);

  const box = audio ? null : await ensureBox(ctx);
  if (box?.speakUrl) {
    const r = await speakViaBox(box.speakUrl, clean.slice(0, 5000), fmt, voice);
    if (r) {
      void touchServiceBox(box.sandboxId);
      audio = { buffer: r.buffer, contentType: r.contentType };
    }
  }
  if (!audio) throw new Error("voice synthesis failed (kokoro box unavailable; sin fallback)");

  const { uploadFile } = await import("./operations");
  const ext = fmt === "ogg" ? "ogg" : "wav";
  const fileName = `voz-${clean.slice(0, 24).replace(/[^\w]+/g, "-")}.${ext}`;
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
  const durationSec = fmt === "wav" ? wavDurationSec(audio.buffer) : 0;
  return { fileId: file.id, audioUrl: file.url || "", source, voice, chars: clean.length, durationSec };
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
