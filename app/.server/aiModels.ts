import { db } from "./db";

export type DocModelOperation =
  | "docDirections"
  | "docDirectionsPreview"
  | "docGenerate"
  | "docRefine"
  | "docVariant";

const DEFAULTS: Record<DocModelOperation, string> = {
  docDirections: "gpt-4o-mini",
  docDirectionsPreview: "gpt-4o-mini",
  docGenerate: "claude-sonnet-4-6",
  docRefine: "claude-haiku-4-5-20251001",
  docVariant: "claude-haiku-4-5-20251001",
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
