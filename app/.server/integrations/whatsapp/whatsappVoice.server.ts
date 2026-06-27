// Voz del FleetAgent — la lógica se movió a la capa de flota channel-agnostic
// (`app/.server/core/fleetVoice.ts`), que consume la caja voice-svc (whisper +
// kokoro) con fallback a ElevenLabs/Gemini, y la usan TODOS los canales (Baileys,
// WABA, web, Slack) — ya no es exclusiva de WhatsApp. Este archivo queda como
// re-export delgado por compatibilidad con los imports existentes del edge Baileys.
export { wantsVoiceReply, synthesizeVoiceOgg, synthesizeVoice } from "~/.server/core/fleetVoice";
export type { SynthResult } from "~/.server/core/fleetVoice";
