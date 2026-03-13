import { db } from "./db";
import { PLANS, normalizePlan, type PlanKey } from "~/lib/plans";

export type GenerationType = "generate" | "refine" | "variant" | "directions" | "enhance";
export type GenerationProduct = "document" | "landing" | "presentation";

/**
 * Check if a user has remaining AI generations for the current month.
 * Resets the counter if more than 30 days have passed since last reset.
 * Returns { allowed, used, limit, bonus }.
 */
export async function checkAiGenerationLimit(userId: string, userPlan?: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      aiGenerationsCount: true,
      aiGenerationsResetAt: true,
      aiGenerationsBonus: true,
    },
  });
  if (!user) throw new Response("User not found", { status: 404 });

  const plan = normalizePlan(userPlan || (user.metadata as any)?.plan);
  const config = PLANS[plan];
  const limit = config.aiGenerationsPerMonth;
  const bonus = user.aiGenerationsBonus || 0;

  // Unlimited plan
  if (limit === null) {
    return { allowed: true, used: user.aiGenerationsCount || 0, limit: null, bonus };
  }

  // Check if we need to reset (30 days since last reset)
  const now = new Date();
  const resetAt = user.aiGenerationsResetAt;
  let count = user.aiGenerationsCount || 0;

  if (!resetAt || now.getTime() - resetAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
    // Reset counter
    await db.user.update({
      where: { id: userId },
      data: { aiGenerationsCount: 0, aiGenerationsResetAt: now },
    });
    count = 0;
  }

  if (count >= limit) {
    // Monthly limit reached — check bonus
    if (bonus > 0) {
      return { allowed: true, used: count, limit, bonus };
    }
    return { allowed: false, used: count, limit, bonus };
  }

  return { allowed: true, used: count, limit, bonus };
}

/**
 * Increment the AI generation counter for a user.
 * Consumes monthly quota first, then bonus.
 */
export interface GenerationLogData {
  type: GenerationType;
  product: GenerationProduct;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  resourceId?: string;
  pageCount?: number;
  durationMs?: number;
  source?: "monthly" | "bonus";
}

/**
 * Log AI usage WITHOUT consuming quota. Use for operations that
 * don't count toward the user's generation limit (directions, enhance).
 */
export function logAiUsage(userId: string, log: GenerationLogData) {
  db.aiGenerationLog.create({
    data: {
      userId,
      type: log.type,
      product: log.product,
      modelId: log.modelId,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      resourceId: log.resourceId,
      pageCount: log.pageCount,
      durationMs: log.durationMs,
      source: log.source,
    },
  }).catch(() => {}); // fire-and-forget
}

export async function incrementAiGeneration(
  userId: string,
  userPlan?: string,
  log?: GenerationLogData
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      aiGenerationsCount: true,
      aiGenerationsBonus: true,
    },
  });
  if (!user) return;

  const plan = normalizePlan(userPlan || (user.metadata as any)?.plan);
  const config = PLANS[plan];
  const limit = config.aiGenerationsPerMonth;
  const count = user.aiGenerationsCount || 0;

  // Determine source: monthly quota or bonus
  const isBonus = limit !== null && count >= limit;
  const source: "monthly" | "bonus" = isBonus ? "bonus" : "monthly";

  // Log generation for analytics (with source)
  if (log) {
    logAiUsage(userId, { ...log, source });
  }

  // Unlimited plan or still under monthly limit → increment monthly counter
  if (limit === null || count < limit) {
    await db.user.update({
      where: { id: userId },
      data: { aiGenerationsCount: { increment: 1 } },
    });
  } else {
    // Monthly limit reached → consume bonus
    const bonus = user.aiGenerationsBonus || 0;
    if (bonus > 0) {
      await db.user.update({
        where: { id: userId },
        data: { aiGenerationsBonus: { decrement: 1 } },
      });
    }
  }
}
