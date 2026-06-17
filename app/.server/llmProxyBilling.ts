import { incrementLLMTokens } from "./llmTokenLimit";
import { logAiUsage } from "./aiGenerationLimit";

/**
 * Cobro de una completion del proxy LLM (DeepSeek).
 * Dos efectos, intencionalmente separados:
 *  - incrementLLMTokens: descuenta del bucket de tokens del usuario (cobro real).
 *  - logAiUsage: fila de analítica con tokens reales (paridad con compute.chat).
 * NO usa incrementAiGeneration — eso descontaría el bucket de CRÉDITOS y sería
 * un doble cobro (los dos buckets son sistemas distintos).
 */
export function bill(data: { usage?: any }, userId: string, model: string): void {
  const u = data?.usage;
  if (!u) return;
  const inTok = u.prompt_tokens || 0;
  const outTok = u.completion_tokens || 0;
  const total = inTok + outTok;
  if (total === 0) return;
  incrementLLMTokens(userId, total);
  logAiUsage(userId, {
    type: "llm.proxy",
    product: "compute",
    modelId: model,
    inputTokens: inTok,
    outputTokens: outTok,
  });
}
