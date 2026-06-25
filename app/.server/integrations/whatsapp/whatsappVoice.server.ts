// Voice replies for the Pool's Baileys edge — ElevenLabs (Fly-reachable) instead
// of ghosty-gc's box-internal kokoro-svc. Synthesizes the reply to OGG/opus and
// the caller sends it as a WhatsApp PTT (voice-note) bubble.
//
// Trigger parity with ghosty: reply with voice when the user sent a voice note OR
// asked for voice — UNLESS they explicitly asked for text. Off via WA_VOICE_REPLIES=0.
const VOICE_ID = process.env.WA_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE || "EXAVITQu4vr4xnSDxMaL";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/https?:\/\/\S+/g, "") // bare URLs
    .replace(/[*_~`#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function synthesizeVoiceOgg(text: string): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  const clean = stripForVoice(text);
  if (!key || !clean) return null;
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/ogg" },
        body: JSON.stringify({ text: clean.slice(0, 5000), model_id: MODEL }),
      }
    );
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}
