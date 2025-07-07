import { db } from "~/.server/db";
import { getStripe } from "~/.server/stripe";
import type { User } from "@prisma/client";

// Función para validar y construir el evento de Stripe
export async function constructStripeEvent(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature provided", { status: 400 });
  }

  try {
    const stripe = getStripe();
    const body = await request.text();

    if (!process.env.STRIPE_SIGN) {
      console.error("STRIPE_SIGN environment variable is not defined");
      return new Response("Webhook configuration error", { status: 500 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_SIGN
    );

    event.data.object.metadata = {
      ...(event.data.object.metadata || {}),
    };

    return event;
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Webhook error", { status: 400 });
  }
}

// Función auxiliar para obtener el email de un evento de Stripe
export function getEmailFromEvent(event: any) {
  const object = event.data.object;
  if (object.customer_email) return object.customer_email;
  if (object.receipt_email) return object.receipt_email;
  if (object.billing_details?.email) return object.billing_details.email;
  return null;
}

// Función auxiliar para asignar assetId a un usuario por email
export async function assignAssetToUserByEmail(metadata: {
  assetId?: string;
  email?: string;
}) :Promise<User>{
  const { assetId, email } = metadata;
  if (!assetId || !email) {
    throw new Error("Missing required metadata");
  }
  let user = await db.user.findUnique({ where: { email } });
  if (user) {  
    // Evitar assetIds repetidos
    const assetIds = Array.from(new Set([...(user.assetIds || []), assetId]));
    await db.user.update({
      where: { email },
      data: {
        assetIds,
      },
    });

  }else{
    user = await db.user.create({
      data: {
        email,
        assetIds: [assetId],
      },
    });
  }

  console.info("::ASSET_ASSIGNED::", assetId + "=>" + user.id);
  return user
}

// Función auxiliar para desasignar assetId de un usuario por email
export async function removeAssetFromUserByEmail(metadata: {
  assetId?: string;
  email?: string;
}) {
  const { assetId, email } = metadata;
  if (!assetId || !email) {
    return new Response("Missing required metadata", { status: 400 });
  }
  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    return new Response("User not found", { status: 404 });
  }
  // Filtrar el assetId de la lista si existe
  const updatedAssetIds = (user.assetIds || []).filter(
    (id: string) => id !== assetId
  );
  await db.user.update({
    where: { email },
    data: {
      assetIds: updatedAssetIds,
    },
  });
  return new Response(null, { status: 200 });
}

// Utilidad para obtener la metadata de un PaymentIntent usando la API REST de Stripe
export async function getPaymentIntentMetadata(
  paymentIntentId: string,
  stripeAccount: string
): Promise<any> {
  const url = `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Account": stripeAccount,
      "Stripe-Version": "2023-08-16",
    },
  });
  if (!response.ok) {
    throw new Error(`Stripe API error: ${response.status}`);
  }
  const data = await response.json();
  return data.metadata || {};
}

// FIXME: Esta función es un workaround temporal. Se debe refactorizar y hacer un spike de Stripe para un flujo robusto.
export async function getLastPendingOrder() {
  return db.order.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}
