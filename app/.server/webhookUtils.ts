import { db } from "~/.server/db";
import { getStripe } from "~/.server/stripe";

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

    return event;
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Webhook error", { status: 400 });
  }
}

// Función auxiliar para obtener metadata de un evento
export function getMetadataFromEvent(event: any) {
  const object = event.data.object;
  // Si el objeto tiene assetId en metadata, usarlo
  if (object.metadata?.assetId) {
    return object.metadata;
  }
  // Si no, buscar en el payment_intent asociado
  if (object.payment_intent?.metadata?.assetId) {
    return object.payment_intent.metadata;
  }
  return null;
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
}) {
  const { assetId, email } = metadata;
  if (!assetId || !email) {
    return new Response("Missing required metadata", { status: 400 });
  }
  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    return new Response("User not found", { status: 404 });
  }
  await db.user.update({
    where: { email },
    data: {
      assetIds: { push: assetId },
    },
  });
  console.info("::USER UPDATED::", user.assetIds);
  return new Response(null, { status: 200 });
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
