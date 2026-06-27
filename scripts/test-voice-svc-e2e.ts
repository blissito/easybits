import { db } from "../app/.server/db";
import type { AuthContext } from "../app/.server/apiAuth";
import { ensureServiceBox, destroyServiceBox } from "../app/.server/core/fleetServiceOperations";
import { synthesizeVoice, transcribeAudio } from "../app/.server/core/fleetVoice";

// E2E real de la capa de voz de flota (fleetVoice) contra el host OVH. Warm-first:
// arrancamos la caja, luego synthesizeVoice/transcribeAudio deben usar la caja
// (source:"box") con el contrato correcto (kokoro lee el body como TEXTO crudo).
async function main() {
  const email = process.argv[2] || "fixtergeek@gmail.com";
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`user ${email} not found`);
  const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE"] };

  console.log(`[1] ensureServiceBox(voice) — warm-up…`);
  const box = await ensureServiceBox(ctx, "voice");
  console.log(`    running: ${box.sandboxId}`);

  console.log(`[2] synthesizeVoice (debe usar la caja, texto crudo)…`);
  const tts = await synthesizeVoice(user.id, "Hola, esta es una prueba real de voz de flota.");
  console.log(`    source=${tts?.source} bytes=${tts?.buffer.length} waveform=${tts?.waveform ? "sí" : "no"}`);

  if (tts?.buffer.length) {
    console.log(`[3] transcribeAudio del audio generado (round-trip)…`);
    const text = await transcribeAudio(user.id, tts.buffer, "audio/ogg");
    console.log(`    transcrito: "${text}"`);
  }

  console.log(`[4] destroyServiceBox…`);
  await destroyServiceBox(ctx, box.sandboxId);
  console.log("    OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
