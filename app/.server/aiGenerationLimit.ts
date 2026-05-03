import { db } from "./db";
import { PLANS, normalizePlan, type PlanKey } from "~/lib/plans";

/**
 * Legacy types kept for backward compatibility. New code should pass any
 * ServiceId string (dotted) — the schema already accepts it.
 */
export type GenerationType =
  | "generate"
  | "refine"
  | "variant"
  | "directions"
  | "enhance"
  | "still"
  | "animate"
  | (string & {}); // allow arbitrary ServiceId without losing autocomplete on legacy values
export type GenerationProduct =
  | "document"
  | "landing"
  | "presentation"
  | "video"
  | "voice"
  | "image"
  | "avatar"
  | "doc"
  | (string & {});

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
 *
 * `cost` (default 1) is the number of "créditos" this operation consumes.
 * For multi-token services (avatar 30s = 15, voice 1min = 3) the orchestrator
 * passes the computed cost. Quota is split across monthly + bonus if needed.
 */
export interface GenerationLogData {
  type: GenerationType;
  product: GenerationProduct;
  cost?: number; // default 1
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  resourceId?: string;
  pageCount?: number;
  durationMs?: number;
  source?: "monthly" | "bonus" | "split";
}

/**
 * Log AI usage WITHOUT consuming quota. Use for operations that
 * don't count toward the user's generation limit (directions, enhance).
 */
export function logAiUsage(userId: string, log: GenerationLogData) {
  db.aiGenerationLog
    .create({
      data: {
        userId,
        type: log.type,
        product: log.product,
        cost: Math.max(1, Math.ceil(log.cost ?? 1)),
        modelId: log.modelId,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        resourceId: log.resourceId,
        pageCount: log.pageCount,
        durationMs: log.durationMs,
        source: log.source,
      },
    })
    .catch(() => {}); // fire-and-forget
}

export async function incrementAiGeneration(
  userId: string,
  userPlan?: string,
  log?: GenerationLogData,
) {
  const cost = Math.max(1, Math.ceil(log?.cost ?? 1));

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
  const bonus = user.aiGenerationsBonus || 0;

  let monthlyDelta = 0;
  let bonusDelta = 0;
  let source: "monthly" | "bonus" | "split";

  if (limit === null) {
    // Unlimited plan — count toward monthly only (for analytics).
    monthlyDelta = cost;
    source = "monthly";
  } else {
    const monthlyAvailable = Math.max(0, limit - count);
    if (cost <= monthlyAvailable) {
      monthlyDelta = cost;
      source = "monthly";
    } else if (monthlyAvailable === 0) {
      bonusDelta = cost;
      source = "bonus";
    } else {
      // Split: monthlyAvailable from monthly, rest from bonus.
      monthlyDelta = monthlyAvailable;
      bonusDelta = cost - monthlyAvailable;
      source = "split";
    }
    // Safety: don't drive bonus negative if for some reason caller didn't pre-check.
    if (bonusDelta > bonus) bonusDelta = bonus;
  }

  // Log analytics with computed cost + source.
  if (log) {
    logAiUsage(userId, { ...log, cost, source });
  }

  if (monthlyDelta === 0 && bonusDelta === 0) return;

  await db.user.update({
    where: { id: userId },
    data: {
      ...(monthlyDelta > 0 && {
        aiGenerationsCount: { increment: monthlyDelta },
      }),
      ...(bonusDelta > 0 && {
        aiGenerationsBonus: { decrement: bonusDelta },
      }),
    },
  });
}
