import { db } from "./db";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type DocModelOperation =
  | "docDirections"
  | "docDirectionsPreview"
  | "docGenerate"
  | "docRefine"
  | "docVariant";

const DEFAULTS: Record<DocModelOperation, string> = {
  docDirections: "gpt-4.1-mini",
  docDirectionsPreview: "claude-sonnet-4-6",
  docGenerate: "claude-haiku-4-5-20251001",
  docRefine: "claude-sonnet-4-6",
  docVariant: "claude-sonnet-4-6",
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
  if (isOpenAi && openaiKey) {
    return createOpenAI({ apiKey: openaiKey })(modelId);
  }
  const aKey = anthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!isOpenAi && aKey) {
    return createAnthropic({ apiKey: aKey })(modelId);
  }
  if (aKey) return createAnthropic({ apiKey: aKey })("claude-sonnet-4-6");
  return createAnthropic()("claude-sonnet-4-6");
}
