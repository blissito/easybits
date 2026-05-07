import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptionResult } from "./transcribe.js";

export type EnrichedCaption = {
  start: number;
  end: number;
  words: Array<{
    text: string;
    start: number;
    end: number;
    isKeyword?: boolean;
    emoji?: string;
  }>;
};

const SYSTEM = `Eres editor de captions virales estilo MrBeast/Hormozi en español.
Recibes una lista de palabras con timestamps. Tu trabajo:
1. Agrupar palabras en bloques MUY CORTOS: idealmente 2 palabras, máximo 3. Nunca 4+. Esto es regla de oro de captions virales.
2. En cada bloque, marca UNA palabra como keyword (la más cargada / verbo de acción / sustantivo clave). No marques artículos ni preposiciones.
3. Solo agrega emoji al keyword si REFUERZA literalmente (perro→🐕, fuego→🔥, dinero→💰). No abuses, mejor sin emoji que un emoji genérico.
4. NO modifiques el texto, solo agrupa y marca

Devuelve JSON válido con este formato exacto:
{
  "captions": [
    {
      "start": <number>,
      "end": <number>,
      "words": [
        {"text": "...", "start": <number>, "end": <number>, "isKeyword": true|false, "emoji": "🔥"|null}
      ]
    }
  ]
}

NO incluyas markdown ni texto fuera del JSON.`;

export async function enrich(
  transcript: TranscriptionResult,
  log: (m: string) => void = () => {},
): Promise<EnrichedCaption[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const client = new Anthropic({ apiKey });
  const userMsg = JSON.stringify({
    words: transcript.words.map((w) => ({
      text: w.word,
      start: Math.round(w.start * 1000) / 1000,
      end: Math.round(w.end * 1000) / 1000,
    })),
  });

  log(`  → Claude Haiku enrichment`);
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32000,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  const final = await stream.finalMessage();

  const textBlock = final.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("no text response from Haiku");

  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n/, "").replace(/\n```$/, "");

  const parsed = JSON.parse(raw) as { captions: EnrichedCaption[] };
  return parsed.captions;
}
