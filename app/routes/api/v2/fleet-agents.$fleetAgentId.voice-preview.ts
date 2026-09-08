import type { Route } from "./+types/fleet-agents.$fleetAgentId.voice-preview";
import { data } from "react-router";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { synthesizeVoice } from "~/.server/core/fleetVoice";

// POST /api/v2/fleet-agents/:fleetAgentId/voice-preview
//
// Dos segundos de muestra para que el admin ELIJA la voz oyéndola, no leyendo su id.
// El archivo declara desde su encabezado que el ensayo vive al lado de la config; el
// selector de voz era el único sitio donde se elegía a ciegas.
//
// Sintetiza por el MISMO camino que un turno real (`synthesizeVoice`), así que lo que
// oyes aquí es lo que va a sonar en WhatsApp: si el canal tiene ElevenLabs encendido con
// su llave, suena ElevenLabs; si no, kokoro. Eso hace de esto también un diagnóstico —
// eliges una voz premium, suena kokoro, y ya sabes que falta encender la capacidad.
//
// `groupId` importa: el motor se resuelve por CANAL (`resolveVoiceEngine` lee las
// capacidades de ese cfgId). Sin él se prueba el default del agente.
const FRASE = "Hola, así es como voy a sonar cuando conteste tus notas de voz.";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return data({ error: "method not allowed" }, { status: 405 });
  const user = await getUserOrRedirect(request);
  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: params.fleetAgentId! },
    select: { id: true, ownerId: true },
  });
  if (!fleetAgent || fleetAgent.ownerId !== user.id) {
    return data({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { voiceId?: string; groupId?: string };
  const voice = typeof body.voiceId === "string" && body.voiceId ? body.voiceId : undefined;

  try {
    const res = await synthesizeVoice(user.id, FRASE, {
      voice,
      fleetAgentId: fleetAgent.id,
      cfgId: body.groupId || undefined,
    });
    // `null` = ni el motor premium ni la caja de voz respondieron. No es un 500 nuestro:
    // el admin necesita saber que ESA voz no se pudo sintetizar, no ver un error genérico.
    if (!res) return data({ error: "no se pudo sintetizar" }, { status: 502 });
    return new Response(new Uint8Array(res.buffer), {
      headers: {
        "Content-Type": "audio/ogg",
        "Cache-Control": "no-store",
        // Qué motor sonó de verdad, para que la UI pueda decir "pediste premium y
        // sonó la incluida" en vez de dejar al admin adivinando.
        "X-Voice-Source": res.source,
      },
    });
  } catch (e) {
    console.error("[voice-preview] falló:", (e as Error)?.message || e);
    return data({ error: "no se pudo sintetizar" }, { status: 502 });
  }
}
