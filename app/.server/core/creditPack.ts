import { db } from "../db";
import { createOrder } from "../getters";
import { default as logger } from "../logger";
import { findPackById } from "~/lib/plans";

/**
 * Acredita un pack al saldo del usuario y registra la venta. Fuente ÚNICA de
 * acreditación: la usan tanto el webhook de compra manual como el auto-topup
 * off-session, para que no diverjan.
 *
 * - Incrementa el bucket correcto (`aiGenerationsBonus` o `llmTokensBonus`)
 *   derivado del pack.
 * - Registra `AiGenerationLog` (stats admin) + `Order` (ledger de ventas).
 *
 * Idempotencia/locks NO viven aquí — son responsabilidad del caller (webhook =
 * Stripe event dedup; auto-topup = lock + idempotency key). Este helper solo
 * aplica el efecto una vez por invocación.
 */
export async function creditPack({
  userId,
  packId,
  email,
  pricePaid,
  currency = "mxn",
  channel = "purchase",
}: {
  userId: string;
  packId: string;
  email: string;
  /** Monto realmente cobrado (MXN). Si se omite, usa el precio del pack. */
  pricePaid?: number;
  currency?: string;
  /** "purchase" (checkout manual) | "auto_topup" (recarga off-session). */
  channel?: "purchase" | "auto_topup";
}): Promise<{ amount: number; bucket: "credits" | "tokens" } | null> {
  const pack = findPackById(packId);
  if (!pack) {
    logger.error("creditPack: unknown packId", { userId, packId });
    return null;
  }

  const price = pricePaid ?? pack.priceMxn;

  await db.user.update({
    where: { id: userId },
    data:
      pack.bucket === "tokens"
        ? { llmTokensBonus: { increment: pack.amount } }
        : { aiGenerationsBonus: { increment: pack.amount } },
  });

  // Stats ledger (admin analytics).
  db.aiGenerationLog
    .create({
      data: {
        userId,
        type: channel === "auto_topup" ? "auto_topup" : "pack_purchase",
        product: "admin",
        pageCount: pack.amount, // reuse pageCount to store granted amount
        source: "bonus",
      },
    })
    .catch(() => {});

  // Sales ledger.
  const unitLabel =
    pack.bucket === "tokens"
      ? `${pack.amount.toLocaleString("es-MX")} tokens LLM`
      : `${pack.amount} créditos`;
  createOrder({
    type: "credit_pack",
    customer_email: email,
    customerId: userId,
    price,
    currency,
    total: `$ ${price.toFixed(2)} ${currency.toUpperCase()}`,
    status: "Paid",
    productId: packId,
    note: `${channel === "auto_topup" ? "Auto-topup" : "Pack"}: ${packId}`,
    items: [
      {
        kind: pack.type,
        refId: packId,
        label: `${packId} — ${unitLabel}`,
        quantity: 1,
        unitPrice: price,
      },
    ],
  }).catch((e) =>
    logger.error("creditPack: order create failed", {
      userId,
      packId,
      error: String(e),
    }),
  );

  logger.info("Pack credited", { userId, packId, amount: pack.amount, channel });
  return { amount: pack.amount, bucket: pack.bucket };
}
