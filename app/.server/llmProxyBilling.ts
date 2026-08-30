import { incrementLLMTokens } from "./llmTokenLimit";
import { logAiUsage } from "./aiGenerationLimit";

/**
 * Cobro de una completion del proxy LLM (DeepSeek).
 * Dos efectos, intencionalmente separados:
 *  - incrementLLMTokens: descuenta del bucket de tokens del usuario (cobro real).
 *  - logAiUsage: fila de analítica con tokens reales (paridad con compute.chat).
 * NO usa incrementAiGeneration — eso descontaría el bucket de CRÉDITOS y sería
 * un doble cobro (los dos buckets son sistemas distintos).
 *
 * Al usuario se le cobra `prompt_tokens + completion_tokens` completos: el
 * descuento por cache es del proveedor, no del plan. Pero se REGISTRA aparte
 * cuántos de esos input tokens pegaron en cache, porque sin ese dato el costo
 * real queda sobreestimado y no se distingue a quien reenvía contexto repetido.
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
    cachedInputTokens: cachedInputTokens(u),
  });
}

/**
 * Input tokens servidos desde el cache de prompt. DeepSeek los reporta como
 * `prompt_cache_hit_tokens`; el resto del ecosistema OpenAI-compatible los pone
 * en `prompt_tokens_details.cached_tokens`. Se aceptan ambos para que un cambio
 * de upstream no deje el campo en blanco sin que nadie lo note.
 */
function cachedInputTokens(u: any): number | undefined {
  const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens;
  return typeof hit === "number" ? hit : undefined;
}
