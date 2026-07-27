import type { Route } from "./+types/fleet-agents.$fleetAgentId.voices";
import { data } from "react-router";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { getSecretValue } from "~/.server/core/secretOperations";
import { KOKORO_VOICES } from "~/.server/core/fleetVoice";

// GET /api/v2/fleet-agents/:fleetAgentId/voices
//
// Catálogo de voces para el selector del admin. Siempre devuelve las de kokoro (estáticas,
// las que trae la caja de voz) y, si el dueño tiene su ELEVENLABS_API_KEY en el vault, las
// suyas de ElevenLabs consultadas en vivo — así el selector muestra sus voces clonadas y no
// una lista hardcodeada que envejece.
//
// La llave NUNCA sale de aquí: se usa server-side para la consulta y sólo se devuelven
// id/nombre/etiquetas.
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: params.fleetAgentId! },
    select: { id: true, ownerId: true },
  });
  if (!fleetAgent || fleetAgent.ownerId !== user.id) {
    return data({ error: "not found" }, { status: 404 });
  }

  const kokoro = KOKORO_VOICES.map((v) => ({ id: v.id, name: v.label, engine: "kokoro" as const }));
  const apiKey = await getSecretValue(user.id, "ELEVENLABS_API_KEY").catch(() => null);
  if (!apiKey) return data({ voices: kokoro, hasElevenLabs: false });

  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return data({ voices: kokoro, hasElevenLabs: true, error: `elevenlabs ${r.status}` });
    const body = (await r.json()) as { voices?: Array<{ voice_id?: string; name?: string; labels?: Record<string, string> }> };
    // SOLO voces en español. El catálogo stock de ElevenLabs es casi todo inglés y, aunque
    // eleven_multilingual_v2 las hace hablar español, salen con acento gringo — peor que
    // kokoro, que al menos tiene voces españolas. Se filtra por `labels.language`, con el
    // acento como respaldo para voces viejas que no lo traen.
    const isSpanish = (l: Record<string, string> = {}) =>
      l.language === "es" || /mexic|latin|spanish|español/i.test(l.accent ?? "");
    const eleven = (body.voices ?? [])
      .filter((v) => v.voice_id && isSpanish(v.labels))
      .map((v) => {
        const l = v.labels ?? {};
        return {
          id: v.voice_id!,
          name: v.name || v.voice_id!,
          engine: "elevenlabs" as const,
          // Acento primero: es lo que decide si suena mexicana o no.
          hint: [l.accent, l.gender, l.use_case].filter(Boolean).join(" · ") || undefined,
          // Las de acento mexicano van arriba; el resto de LatAm después.
          rank: /mexic/i.test(l.accent ?? "") ? 0 : 1,
        };
      })
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank: _rank, ...v }) => v);
    return data({ voices: [...kokoro, ...eleven], hasElevenLabs: true });
  } catch (e) {
    console.error("[voices] elevenlabs list falló:", (e as Error)?.message || e);
    return data({ voices: kokoro, hasElevenLabs: true, error: "unreachable" });
  }
}
