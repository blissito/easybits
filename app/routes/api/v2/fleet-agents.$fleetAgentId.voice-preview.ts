import type { Route } from "./+types/fleet-agents.$fleetAgentId.voice-preview";
import { data } from "react-router";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { synthesizeVoice, speakViaElevenLabs, resolveVoiceEngine, KOKORO_VOICES } from "~/.server/core/fleetVoice";
import { getSecretValue } from "~/.server/core/secretOperations";

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
// Corta a propósito: kokoro sintetiza en tiempo proporcional al texto, y esto se pide
// desde un botón. Basta para reconocer la voz.
const FRASE = "Hola, así voy a sonar cuando conteste.";

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
  const esKokoro = !voice || KOKORO_VOICES.some((v) => v.id === voice);

  try {
    // Qué motor le TOCA a este canal de verdad. Es lo que decidirá un turno real.
    const eng = await resolveVoiceEngine(user.id, {
      voice,
      fleetAgentId: fleetAgent.id,
      cfgId: body.groupId || undefined,
    });

    // 🚨 Una voz de ElevenLabs NO se le puede pedir a kokoro: son catálogos distintos y
    // la caja devuelve nada. Ése era el "no se pudo generar la muestra" cuando la
    // capacidad estaba apagada — precisamente el caso en que MÁS quieres oírla, porque
    // estás decidiendo si vale la pena encenderla.
    //
    // Así que el ensayo usa la llave del DUEÑO directamente (la misma que ya lee el
    // catálogo en /voices) y avisa aparte si ese motor está activo en el canal o no.
    // Oyes la voz real; la cabecera te dice si hoy sonaría.
    if (!esKokoro) {
      const apiKey = eng.engine === "elevenlabs"
        ? eng.apiKey
        : await getSecretValue(user.id, "ELEVENLABS_API_KEY").catch(() => null);
      if (!apiKey) {
        return data({ error: "sin llave de ElevenLabs" }, { status: 400 });
      }
      const buf = await speakViaElevenLabs(apiKey, FRASE, voice!, "ogg");
      if (!buf) return data({ error: "ElevenLabs no devolvió audio" }, { status: 502 });
      return audio(buf, "elevenlabs", eng.engine === "elevenlabs");
    }

    // Voz incluida: por el mismo camino que un turno real.
    const res = await synthesizeVoice(user.id, FRASE, {
      voice,
      fleetAgentId: fleetAgent.id,
      cfgId: body.groupId || undefined,
    });
    if (!res) return data({ error: "la caja de voz no respondió" }, { status: 502 });
    return audio(res.buffer, res.source, true);
  } catch (e) {
    console.error("[voice-preview] falló:", (e as Error)?.message || e);
    return data({ error: "no se pudo sintetizar" }, { status: 502 });
  }
}

// `X-Voice-Source` = qué motor sonó. `X-Voice-Active` = si ESE motor es el que usaría
// hoy este canal. Separados a propósito: oír la voz y saber que todavía no está
// encendida son dos datos distintos, y juntarlos en uno obliga a mentir en un caso.
function audio(buffer: Buffer, source: string, active: boolean) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "audio/ogg",
      "Cache-Control": "no-store",
      "X-Voice-Source": source,
      "X-Voice-Active": active ? "1" : "0",
    },
  });
}
