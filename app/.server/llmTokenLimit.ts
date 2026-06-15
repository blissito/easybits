import { db } from "./db";
import { PLANS, normalizePlan, type PlanKey } from "~/lib/plans";
import { maybeAutoTopup } from "./core/autoTopup";

/**
 * Límite de tokens LLM separado de créditos de documentos.
 * Reset semanal para Byte, mensual para Mega/Tera.
 *
 * Soporta "recargas" vía llmTokensBonus: tokens extra comprados
 * que se consumen después del límite del plan.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface LLMTokenLimit {
  allowed: boolean;
  used: number;
  /** Límite del plan (sin bonus) */
  planLimit: number;
  /** Bonus comprado (recargas) */
  bonus: number;
  /** Límite total = planLimit + bonus */
  limit: number;
  remaining: number;
  resetAt: Date | null;
}

export async function checkLLMTokenLimit(
  userId: string,
  userPlan?: string,
): Promise<LLMTokenLimit> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      llmTokensUsed: true,
      llmTokensResetAt: true,
      llmTokensBonus: true,
      autoTopup: true,
    },
  });
  if (!user) throw new Error("User not found");

  const plan = normalizePlan(userPlan || (user.metadata as any)?.plan);
  const config = PLANS[plan];
  const planLimit = config.llmTokensFreePerMonth;
  const used = user.llmTokensUsed || 0;
  const bonus = user.llmTokensBonus || 0;
  const resetAt = user.llmTokensResetAt;
  const now = new Date();

  const resetWindow = plan === "Byte" ? WEEK_MS : MONTH_MS;

  if (!resetAt || now.getTime() - resetAt.getTime() > resetWindow) {
    await db.user.update({
      where: { id: userId },
      data: { llmTokensUsed: 0, llmTokensResetAt: now, llmTokensBonus: 0 },
    });
    const limit = planLimit; // bonus resetea con el ciclo
    return {
      allowed: used < limit, used: 0, planLimit, bonus: 0,
      limit, remaining: limit, resetAt: now,
    };
  }

  const limit = planLimit + bonus;
  const remaining = Math.max(0, limit - used);

  // Saldo de tokens agotado: dispara recarga automática si está activa.
  if (remaining === 0 && user.autoTopup?.enabled) {
    maybeAutoTopup(userId, "tokens").catch(() => {});
  }

  return {
    allowed: remaining > 0,
    used,
    planLimit,
    bonus,
    limit,
    remaining,
    resetAt,
  };
}

/** Incrementa tokens usados. Fire-and-forget. */
export function incrementLLMTokens(userId: string, tokens: number): void {
  db.user
    .update({ where: { id: userId }, data: { llmTokensUsed: { increment: tokens } } })
    .catch(() => {});
}

/** Recarga: agrega tokens bonus. Usa Stripe o créditos internos. */
export async function recargarLLMTokens(
  userId: string,
  tokens: number,
): Promise<LLMTokenLimit> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { llmTokensBonus: true, metadata: true },
  });
  if (!user) throw new Error("User not found");

  const currentBonus = user.llmTokensBonus || 0;
  await db.user.update({
    where: { id: userId },
    data: { llmTokensBonus: currentBonus + tokens },
  });

  return checkLLMTokenLimit(userId, (user.metadata as any)?.plan);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
