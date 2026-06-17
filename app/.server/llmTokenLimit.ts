import { db } from "./db";
import { PLANS, normalizePlan, getUserPlan, type PlanKey } from "~/lib/plans";
import { maybeAutoTopup } from "./core/autoTopup";

/**
 * Límite de tokens LLM separado de créditos de documentos.
 * Byte = grant promocional de 5M (solo junio 2026, one-time, NO recarga).
 * Mega/Tera = reset mensual.
 *
 * Soporta "recargas" vía llmTokensBonus: tokens extra comprados que se
 * consumen después del límite del plan y PERSISTEN entre ciclos.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/** Cierre de la promo de 5M gratis para Byte. Tras esta fecha, Byte nuevo recibe 0. */
const BYTE_PROMO_END = new Date("2026-07-01T00:00:00Z");

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
  /** Plan del usuario — Byte es one-time, Mega/Tera mensual. */
  plan: PlanKey;
}

export async function checkLLMTokenLimit(
  userId: string,
  userPlan?: string,
): Promise<LLMTokenLimit> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      metadata: true,
      roles: true,
      llmTokensUsed: true,
      llmTokensResetAt: true,
      llmTokensBonus: true,
      autoTopup: true,
    },
  });
  if (!user) throw new Error("User not found");

  // El plan vive en roles[] (lo escribe el webhook de Stripe), con metadata.plan
  // como fallback. getUserPlan honra ambos — no usar normalizePlan(metadata) solo.
  const plan = userPlan ? normalizePlan(userPlan) : getUserPlan(user);
  const config = PLANS[plan];
  const planLimit = config.llmTokensIncluded;
  const used = user.llmTokensUsed || 0;
  const bonus = user.llmTokensBonus || 0;
  const resetAt = user.llmTokensResetAt;
  const now = new Date();

  if (plan === "Byte") {
    // Promo de lanzamiento: los 5M gratis solo se otorgan durante junio 2026.
    // Se "reclama" sellando resetAt una sola vez. Quien ya reclamó conserva su
    // saldo de por vida; quien no reclamó antes del cierre ya no recibe el grant.
    const claimed = !!resetAt;
    const justClaimed = !claimed && now < BYTE_PROMO_END;
    if (justClaimed) {
      await db.user.update({
        where: { id: userId },
        data: { llmTokensResetAt: now },
      });
    }
    const hasGrant = claimed || justClaimed;
    const grantedLimit = hasGrant ? planLimit : 0;
    const limit = grantedLimit + bonus;
    const remaining = Math.max(0, limit - used);
    if (remaining === 0 && user.autoTopup?.enabled) {
      maybeAutoTopup(userId, "tokens").catch(() => {});
    }
    return {
      allowed: remaining > 0,
      used,
      planLimit: grantedLimit,
      bonus,
      limit,
      remaining,
      resetAt: hasGrant ? (resetAt ?? now) : null,
      plan,
    };
  }

  // Mega/Tera: reset mensual del consumo. El bonus comprado PERSISTE.
  if (!resetAt || now.getTime() - resetAt.getTime() > MONTH_MS) {
    await db.user.update({
      where: { id: userId },
      data: { llmTokensUsed: 0, llmTokensResetAt: now },
    });
    const limit = planLimit + bonus;
    return {
      allowed: limit > 0, used: 0, planLimit, bonus,
      limit, remaining: limit, resetAt: now, plan,
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
    plan,
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
    select: { llmTokensBonus: true },
  });
  if (!user) throw new Error("User not found");

  const currentBonus = user.llmTokensBonus || 0;
  await db.user.update({
    where: { id: userId },
    data: { llmTokensBonus: currentBonus + tokens },
  });

  // Sin pasar plan: checkLLMTokenLimit lo resuelve vía getUserPlan (roles + metadata).
  return checkLLMTokenLimit(userId);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
