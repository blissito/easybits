import { db } from "./db";
import { PLANS, type PlanKey } from "~/lib/plans";

/**
 * Check if a user has remaining AI generations for the current month.
 * Resets the counter if more than 30 days have passed since last reset.
 * Returns { allowed, used, limit } or throws a 429 Response if over limit.
 */
export async function checkAiGenerationLimit(userId: string, userPlan?: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      aiGenerationsCount: true,
      aiGenerationsResetAt: true,
    },
  });
  if (!user) throw new Response("User not found", { status: 404 });

  const plan = (userPlan || (user.metadata as any)?.plan || "Spark") as PlanKey;
  const config = PLANS[plan] || PLANS.Spark;
  const limit = config.aiGenerationsPerMonth;

  // Unlimited plan
  if (limit === null) {
    return { allowed: true, used: user.aiGenerationsCount || 0, limit: null };
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
    return { allowed: false, used: count, limit };
  }

  return { allowed: true, used: count, limit };
}

/**
 * Increment the AI generation counter for a user.
 */
export async function incrementAiGeneration(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { aiGenerationsCount: { increment: 1 } },
  });
}
