import { db } from "./db";
import { PLANS, type PlanKey } from "~/lib/plans";

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

  const plan = (userPlan || (user.metadata as any)?.plan || "Spark") as PlanKey;
  const config = PLANS[plan] || PLANS.Spark;
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
    return { allowed: false, used: count, limit, bonus: 0 };
  }

  return { allowed: true, used: count, limit, bonus };
}

/**
 * Increment the AI generation counter for a user.
 * Consumes monthly quota first, then bonus.
 */
export async function incrementAiGeneration(userId: string, userPlan?: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      aiGenerationsCount: true,
      aiGenerationsBonus: true,
    },
  });
  if (!user) return;

  const plan = (userPlan || (user.metadata as any)?.plan || "Spark") as PlanKey;
  const config = PLANS[plan] || PLANS.Spark;
  const limit = config.aiGenerationsPerMonth;
  const count = user.aiGenerationsCount || 0;

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
