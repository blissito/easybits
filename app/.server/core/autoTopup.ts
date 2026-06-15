import { db } from "../db";
import { getStripe } from "../stripe";
import { default as logger } from "../logger";
import { findPackById } from "~/lib/plans";
import { creditPack } from "./creditPack";
import { sendAutoTopupEmail } from "../emails/sendAutoTopup";

/**
 * Recarga automática al alcanzar el límite. Disparada fire-and-forget desde los
 * limit-checks (checkAiGenerationLimit / checkLLMTokenLimit) cuando el saldo se
 * agota y el usuario tiene auto-topup activo.
 *
 * Garantías:
 * - UN solo cobro por ciclo: lock atómico compare-and-set sobre `charging`
 *   (MongoDB re-evalúa el predicado bajo lock de documento) + idempotency key
 *   de Stripe por `chargeEpoch`. Mil requests concurrentes → un PaymentIntent.
 * - UN solo intento, sin insistir: si la tarjeta rechaza, `enabled=false` hasta
 *   que el usuario reactive manualmente.
 *
 * @param triggeredBucket bucket que se agotó ("credits" | "tokens"). Si la
 *   config protege el otro bucket, se libera el lock sin cobrar.
 */
export async function maybeAutoTopup(
  userId: string,
  triggeredBucket: "credits" | "tokens",
): Promise<void> {
  // 1. Lock atómico: solo gana quien encuentra enabled=true && charging=false.
  const lock = await db.user.updateMany({
    where: { id: userId, autoTopup: { is: { enabled: true, charging: false } } },
    data: { autoTopup: { upsert: { set: null, update: { charging: true } } } },
  });
  if (lock.count === 0) return; // no aplica, o ya hay un cobro en curso

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, customer: true, autoTopup: true },
  });
  const cfg = user?.autoTopup;
  if (!user || !cfg) {
    await releaseLock(userId);
    return;
  }

  const pack = findPackById(cfg.packId);

  // La config protege el otro bucket — no es nuestro disparo.
  if (!pack || pack.bucket !== triggeredBucket) {
    await releaseLock(userId);
    return;
  }

  // Config incompleta (sin tarjeta/cliente) — desactivar y avisar.
  if (!user.customer || !cfg.paymentMethod) {
    await failAutoTopup(userId, cfg.chargeEpoch + 1, "missing customer or payment method");
    notify(user.email, "failed", pack.id, pack.priceMxn);
    return;
  }

  const idempotencyKey = `autotopup_${userId}_${cfg.chargeEpoch}`;

  // ── Fase A: el cobro. Un fallo aquí es seguro de marcar "failed" (no se
  // movió dinero, o Stripe lo rechazó) → desactivar y avisar.
  let pi: any;
  try {
    pi = await getStripe().paymentIntents.create(
      {
        amount: Math.round(pack.priceMxn * 100), // centavos
        currency: "mxn",
        customer: user.customer,
        payment_method: cfg.paymentMethod,
        off_session: true,
        confirm: true,
        metadata: { type: pack.type, userId, packId: pack.id, channel: "auto_topup" },
      },
      { idempotencyKey },
    );
  } catch (e: any) {
    await failAutoTopup(userId, cfg.chargeEpoch + 1, String(e?.code || e?.message || e));
    logger.warn("auto-topup charge failed", { userId, packId: cfg.packId, error: String(e?.message || e) });
    notify(user.email, "failed", cfg.packId, pack.priceMxn);
    return;
  }

  if (pi.status !== "succeeded") {
    // Off-session no debería quedar en requires_action sin throw, pero por si.
    await failAutoTopup(userId, cfg.chargeEpoch + 1, `payment status: ${pi.status}`);
    notify(user.email, "failed", pack.id, pack.priceMxn);
    return;
  }

  // ── Fase B: el cobro YA tuvo éxito (el dinero se movió). Un fallo de
  // bookkeeping aquí NO debe marcar "failed" ni avisar fallo (el cargo es
  // real) ni dejar que se re-cobre en loop. Se desactiva para frenar el loop
  // y se loguea CRÍTICO para reconciliación manual de ops.
  try {
    await creditPack({
      userId,
      packId: pack.id,
      email: user.email,
      pricePaid: pack.priceMxn,
      channel: "auto_topup",
    });
    // Libera lock + avanza epoch (idempotency key del próximo ciclo es distinta).
    await db.user.update({
      where: { id: userId },
      data: {
        autoTopup: {
          upsert: {
            set: null,
            update: {
              charging: false,
              lastTopupAt: new Date(),
              chargeEpoch: cfg.chargeEpoch + 1,
              failedAt: null,
              lastError: null,
            },
          },
        },
      },
    });
    logger.info("auto-topup charged", { userId, packId: pack.id, amount: pack.amount });
    notify(user.email, "success", pack.id, pack.priceMxn);
  } catch (e: any) {
    logger.error(
      "AUTO-TOPUP CHARGED BUT CREDITING FAILED — manual reconcile needed",
      { userId, packId: pack.id, amount: pack.amount, error: String(e?.message || e) },
    );
    // Frenar el loop de re-cobro; ops acredita manualmente. Sin email engañoso.
    await failAutoTopup(userId, cfg.chargeEpoch + 1, "charged but crediting failed").catch(() => {});
  }
}

/** Libera el lock sin tocar el resto del estado. */
async function releaseLock(userId: string): Promise<void> {
  await db.user
    .update({
      where: { id: userId },
      data: { autoTopup: { upsert: { set: null, update: { charging: false } } } },
    })
    .catch(() => {});
}

/**
 * Estado terminal de fallo: desactiva (sin reintentos). Reactivar es manual.
 * Avanza `chargeEpoch` para que el próximo intento (tras reactivar) use una
 * idempotency key fresca — si no, Stripe devolvería el decline cacheado (24h)
 * y la tarjeta nueva nunca se cobraría.
 */
async function failAutoTopup(
  userId: string,
  nextEpoch: number,
  error: string,
): Promise<void> {
  await db.user
    .update({
      where: { id: userId },
      data: {
        autoTopup: {
          upsert: {
            set: null,
            update: {
              enabled: false,
              charging: false,
              chargeEpoch: nextEpoch,
              failedAt: new Date(),
              lastError: error.slice(0, 300),
            },
          },
        },
      },
    })
    .catch(() => {});
}

function notify(
  email: string,
  kind: "success" | "failed",
  packId: string,
  priceMxn: number,
): void {
  sendAutoTopupEmail(email, kind, { packId, priceMxn }).catch(() => {});
}
