import { db } from "./db";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type DocModelOperation =
  | "docDirections"
  | "docDirectionsPreview"
  | "docGenerate"
  | "docRefine"
  | "docRegeneratePage"
  | "docAutoDescribe"
  // Extracción tipada de la señal de pago en un turno de WhatsApp (superficie WABA).
  // Corre por turno, así que quiere el modelo más barato que cumpla; se puede cambiar
  // desde AppConfig sin deploy si la precisión no alcanza.
  // ⚠️ NO usar gemini-* aquí: la GOOGLE_GENERATIVE_AI_API_KEY del proyecto está en free
  // tier (20 requests/día) — a volumen de producción devolvería null por cuota y la
  // etapa dejaría de moverse EN SILENCIO. Haiku es el mismo modelo que ya usan
  // autoTagFile/searchFilesWithAI en core/ai.ts.
  | "wabaPaymentSignal";

// gemini-2.5-pro quedó retirado para la llave del proyecto (404 "no longer available to new
// users", 2026-09-25) y los Gemini Flash están en el tier gratuito de 20/día, que falla en
// silencio a volumen. Documents va con Anthropic (llave de pago): generar con Sonnet,
// refinar / variantes / pasos rápidos con Haiku (la economía de CLAUDE.md).
const DEFAULTS: Record<DocModelOperation, string> = {
  docDirections: "claude-haiku-4-5-20251001",
  docDirectionsPreview: "claude-haiku-4-5-20251001",
  docGenerate: "claude-sonnet-5",
  docRefine: "claude-haiku-4-5-20251001",
  docRegeneratePage: "claude-haiku-4-5-20251001",
  docAutoDescribe: "claude-haiku-4-5-20251001",
  wabaPaymentSignal: "claude-haiku-4-5-20251001",
};

let cache: Record<string, string> | null = null;
let cacheTime = 0;
const TTL = 60_000; // 60s

async function loadModels(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  try {
    const config = await db.appConfig.findUnique({ where: { key: "ai-models" } });
    cache = (config?.value as Record<string, string>) || {};
  } catch {
    cache = {};
  }
  cacheTime = now;
  return cache;
}

export async function getAiModel(operation: DocModelOperation): Promise<string> {
  const models = await loadModels();
  return models[operation] || DEFAULTS[operation];
}

export function invalidateModelCache() {
  cache = null;
  cacheTime = 0;
}

export function resolveModelLocal(modelId: string, openaiKey?: string, anthropicKey?: string): LanguageModel {
  const isOpenAi = /^(gpt-|o[1-9]|dall-e|tts-|whisper|chatgpt-)/.test(modelId);
  const oKey = openaiKey || process.env.OPENAI_API_KEY;
  if (isOpenAi && oKey) {
    return createOpenAI({ apiKey: oKey })(modelId);
  }
  const isGemini = /^gemini-/.test(modelId);
  if (isGemini) {
    const gKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (gKey) return createGoogleGenerativeAI({ apiKey: gKey })(modelId);
  }
  const aKey = anthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!isOpenAi && !isGemini && aKey) {
    return createAnthropic({ apiKey: aKey })(modelId);
  }
  if (aKey) return createAnthropic({ apiKey: aKey })("claude-sonnet-4-6");
  return createAnthropic()("claude-sonnet-4-6");
}
