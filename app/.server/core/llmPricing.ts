/**
 * Per-model pricing for the managed `agent_run` tool.
 *
 * Prices are USD per 1M tokens, billed at provider list rate. Markup happens
 * at the credit conversion layer — this file only computes raw provider cost.
 *
 * Sources: anthropic.com/pricing (verified 2026-05).
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMTok: number;
  /** USD per 1M output tokens */
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Claude 4 family
  "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

const DEFAULT_PRICING = PRICING["claude-sonnet-4-6"];

export function getModelPricing(modelId: string): ModelPricing {
  return PRICING[modelId] ?? DEFAULT_PRICING;
}

/** Returns cost in USD cents (rounded up to nearest cent, min 1). */
export function computeCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = getModelPricing(modelId);
  const usd =
    (inputTokens * p.inputPerMTok) / 1_000_000 +
    (outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.max(1, Math.ceil(usd * 100));
}
