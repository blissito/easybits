/**
 * Single orchestrator for premium services.
 *
 * Responsibilities:
 *   1. Resolve the registered service.
 *   2. Compute cost (in créditos) from input.
 *   3. Pre-check quota (monthly + bonus combined).
 *   4. Call the provider's execute().
 *   5. Decrement credits + write AiGenerationLog with the actual cost.
 *
 * Provider adapters MUST NOT do any of this themselves. Keeping all credit
 * logic here means: adding a new provider does not touch logging, billing,
 * or quotas.
 */
import {
  checkAiGenerationLimit,
  incrementAiGeneration,
} from "../aiGenerationLimit";
import { getService } from "./registry";
import { QuotaExceededError } from "./errors";
import type { ServiceCtx, ServiceResult } from "./types";

export async function consumeService<O extends ServiceResult = ServiceResult>(
  serviceId: string,
  input: unknown,
  ctx: ServiceCtx,
): Promise<O> {
  const def = getService(serviceId);
  if (!def) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const cost = Math.max(1, Math.ceil(def.estimateCost(input)));

  // Pre-check: do we have enough créditos across both buckets?
  const limit = await checkAiGenerationLimit(ctx.userId, ctx.userPlan);
  const monthlyAvailable =
    limit.limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit.limit - limit.used);
  const totalAvailable = monthlyAvailable + (limit.bonus ?? 0);
  if (totalAvailable < cost) {
    throw new QuotaExceededError(serviceId, cost, totalAvailable);
  }

  // Execute the provider call.
  const start = Date.now();
  const result = (await def.execute(input, ctx)) as O;
  const durationMs = Date.now() - start;

  // Decrement + log (single source of truth for credit accounting).
  await incrementAiGeneration(ctx.userId, ctx.userPlan, {
    type: serviceId,
    product: def.product,
    cost,
    durationMs,
    resourceId: ctx.resourceId,
    modelId: result.modelId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return result;
}
