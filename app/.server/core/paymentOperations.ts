import { randomUUID } from "crypto";
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { config } from "../config";
import { createPreference } from "../payments/mercadopago";
import { dispatchWebhooks } from "../webhooks";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return "****" + token.slice(-4);
}

/** Connect (or update) the user's MercadoPago BYO credentials. */
export async function connectMpProvider(
  ctx: AuthContext,
  opts: { accessToken: string; publicKey?: string; webhookSecret?: string }
) {
  const record = await db.paymentProvider.upsert({
    where: {
      userId_provider: { userId: ctx.user.id, provider: "MERCADOPAGO" },
    },
    create: {
      userId: ctx.user.id,
      provider: "MERCADOPAGO",
      accessToken: opts.accessToken,
      publicKey: opts.publicKey,
      webhookSecret: opts.webhookSecret,
    },
    update: {
      accessToken: opts.accessToken,
      publicKey: opts.publicKey,
      webhookSecret: opts.webhookSecret,
    },
  });
  return {
    id: record.id,
    provider: record.provider,
    maskedToken: maskToken(record.accessToken),
  };
}

export async function getMpProvider(userId: string) {
  return db.paymentProvider.findUnique({
    where: { userId_provider: { userId, provider: "MERCADOPAGO" } },
  });
}

/** Create a MercadoPago payment link (Checkout Pro preference). */
export async function createPaymentLink(
  ctx: AuthContext,
  opts: { title: string; amount: number; currency?: string; payerEmail?: string }
) {
  const provider = await getMpProvider(ctx.user.id);
  if (!provider) {
    throw new Response(
      JSON.stringify({ error: "MercadoPago no conectado. Conéctalo en /dash/developer/payments." }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const externalReference = `paylink:${randomUUID()}`;
  const link = await db.paymentLink.create({
    data: {
      userId: ctx.user.id,
      title: opts.title,
      amountCents: Math.round(opts.amount * 100),
      currency: opts.currency ?? "MXN",
      externalReference,
      status: "pending",
    },
  });

  const { preferenceId, initPoint } = await createPreference({
    token: provider.accessToken,
    title: opts.title,
    amount: opts.amount,
    currency: opts.currency,
    externalReference,
    payerEmail: opts.payerEmail,
    notificationUrl: `${config.baseUrl}/api/webhooks/mercadopago?plid=${link.id}`,
    backUrl: `${config.baseUrl}/dash`,
  });

  const updated = await db.paymentLink.update({
    where: { id: link.id },
    data: { mpPreferenceId: preferenceId, initPoint },
  });
  return {
    id: updated.id,
    title: updated.title,
    amount: updated.amountCents / 100,
    currency: updated.currency,
    initPoint: updated.initPoint,
    status: updated.status,
  };
}

export async function listPaymentLinks(ctx: AuthContext, limit = 50) {
  const links = await db.paymentLink.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return links.map((l) => ({
    id: l.id,
    title: l.title,
    amount: l.amountCents / 100,
    currency: l.currency,
    initPoint: l.initPoint,
    status: l.status,
    payerEmail: l.payerEmail,
    createdAt: l.createdAt,
    paidAt: l.paidAt,
  }));
}

/**
 * Mark a payment link as paid (called from the MP webhook after confirming the
 * payment via the seller token). Idempotent + fires `payment.paid` once.
 */
export async function markPaymentPaid(
  paymentLinkId: string,
  payerEmail?: string
) {
  const link = await db.paymentLink.findUnique({ where: { id: paymentLinkId } });
  if (!link || link.status === "paid") return;

  await db.paymentLink.update({
    where: { id: paymentLinkId },
    data: { status: "paid", payerEmail, paidAt: new Date() },
  });

  await dispatchWebhooks(link.userId, "payment.paid", {
    id: link.id,
    title: link.title,
    amount: link.amountCents / 100,
    currency: link.currency,
    payerEmail: payerEmail ?? null,
  });
}
