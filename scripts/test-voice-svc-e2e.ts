import { db } from "../app/.server/db";
import type { AuthContext } from "../app/.server/apiAuth";
import {
  ensureServiceBox,
  destroyServiceBox,
} from "../app/.server/core/fleetServiceOperations";

// E2E real: levanta voice-svc en el host OVH, prueba TTS (readiness 2-puertos) y
// STT (round-trip), y destruye la caja. NO depende del deploy a Fly ni de una API
// key — corre el código directo contra prod DB + host.
async function main() {
  const email = process.argv[2] || "fixtergeek@gmail.com";
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`user ${email} not found`);
  const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE"] };

  const t0 = Date.now();
  console.log(`[1] ensureServiceBox(voice) para ${email}…`);
  const box = await ensureServiceBox(ctx, "voice");
  console.log(`    listo en ${Date.now() - t0}ms`, JSON.stringify(box, null, 2));

  if (!box.speakUrl) throw new Error("sin speakUrl");

  // #5 — readiness 2-puertos: un /speak inmediato NO debe dar http=000.
  console.log(`[2] TTS POST ${box.speakUrl}`);
  const tts = await fetch(box.speakUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Hola, esto es una prueba de voz." }),
    signal: AbortSignal.timeout(30000),
  });
  const audio = Buffer.from(await tts.arrayBuffer());
  console.log(`    TTS http=${tts.status} bytes=${audio.length}`);

  // STT round-trip: transcribir el audio que acabamos de generar.
  if (box.transcribeUrl && audio.length > 0) {
    console.log(`[3] STT POST ${box.transcribeUrl}`);
    const stt = await fetch(box.transcribeUrl, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: audio,
      signal: AbortSignal.timeout(60000),
    });
    const text = await stt.text();
    console.log(`    STT http=${stt.status} body=${text.slice(0, 300)}`);
  }

  // Limpieza — no dejar la caja corriendo.
  console.log(`[4] destroyServiceBox(${box.sandboxId})`);
  await destroyServiceBox(ctx, box.sandboxId);
  console.log("    destruida. OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
