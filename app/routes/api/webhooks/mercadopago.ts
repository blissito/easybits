import { data } from "react-router";
import { db } from "~/.server/db";
import { getPayment, verifyMpSignature } from "~/.server/payments/mercadopago";
import { getMpProvider, markPaymentPaid } from "~/.server/core/paymentOperations";
import type { Route } from "./+types/mercadopago";

/**
 * MercadoPago webhook (BYO model). The notification only carries `data.id`, so
 * we identify the seller via the `plid` query param we set on the preference's
 * notification_url, then fetch the payment with that seller's token to confirm
 * status authoritatively (signature is optional hardening for BYO).
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const plid = url.searchParams.get("plid");
  const dataId = url.searchParams.get("data.id") ?? "";

  // MP sends notifications as POST with a JSON body; fall back to query params.
  let body: { type?: string; data?: { id?: string } } = {};
  try {
    body = await request.json();
  } catch {
    body = {
      type: url.searchParams.get("type") ?? undefined,
      data: { id: dataId || undefined },
    };
  }

  const type = body.type ?? url.searchParams.get("type") ?? "";
  const paymentId = body.data?.id ?? dataId;

  // Only payment notifications are relevant; ack everything else.
  if (type !== "payment" || !paymentId || !plid) {
    return data({ ok: true });
  }

  const link = await db.paymentLink.findUnique({ where: { id: plid } });
  if (!link) return data({ ok: true });

  const provider = await getMpProvider(link.userId);
  if (!provider) return data({ ok: true });

  // Optional signature check (only enforced if the seller stored a secret).
  const validSig = await verifyMpSignature({
    secret: provider.webhookSecret,
    xSignature: request.headers.get("x-signature") ?? "",
    xRequestId: request.headers.get("x-request-id") ?? "",
    dataId: paymentId,
  });
  if (!validSig) {
    throw data({ error: "Invalid signature" }, { status: 401 });
  }

  // Authoritative check: fetch the payment with the seller's own token.
  try {
    const payment = await getPayment(provider.accessToken, paymentId);
    if (
      payment.status === "approved" &&
      payment.external_reference === link.externalReference
    ) {
      await markPaymentPaid(link.id, payment.payer?.email);
    }
  } catch (err) {
    console.error("mercadopago webhook: payment fetch failed", err);
  }

  return data({ ok: true });
}

// MP can probe with GET and notify with POST.
export const loader = async ({ request }: Route.LoaderArgs) => handle(request);
export const action = async ({ request }: Route.ActionArgs) => handle(request);
