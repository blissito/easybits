import { getStripe } from "~/.server/stripe";
import { db } from "~/.server/db";
import { default as logger } from "~/.server/logger";
import type { StripeSession } from "~/.server/types/stripe";
import type { ActionFunctionArgs } from "~/.server/types/react-router";
import Stripe from "stripe";

// Función para manejar eventos de suscripción
async function handleSubscriptionEvent(
  subscriptionEvent: Stripe.Subscription,
  currentRoles: string[]
): Promise<string[]> {
  let roles = [...currentRoles];
  
  // Agregar o remover roles según el plan de suscripción
  if (subscriptionEvent.items?.data[0]?.plan?.id === 'premium_plan') {
    if (!roles.includes('premium')) {
      roles.push('premium');
    }
  } else {
    roles = roles.filter(role => role !== 'premium');
  }

  return roles;
}

// Estado de la asignación de asset
enum AssetAssignmentStatus {
  SUCCESS = "success",
  FAILED = "failed",
  FALLBACK_SUCCESS = "fallback_success",
  FALLBACK_FAILED = "fallback_failed"
}

// Registro de intentos de asignación de asset
interface AssetAssignmentAttempt {
  sessionId: string;
  assetId: string;
  merchantStripeId: string;
  email: string;
  status: AssetAssignmentStatus;
  timestamp: Date;
  error?: string;
}

// Función para registrar intentos de asignación
async function logAssetAssignmentAttempt(
  sessionId: string,
  assetId: string,
  merchantStripeId: string,
  email: string,
  status: AssetAssignmentStatus,
  error?: string
) {
  const attempt: AssetAssignmentAttempt = {
    sessionId,
    assetId,
    merchantStripeId,
    email,
    status,
    timestamp: new Date(),
    error
  };
  
  logger.info("Asset assignment attempt:", attempt);
}

// Función principal para asignar asset
async function assignAssetToUser(
  session: StripeSession,
  stripe: Stripe
): Promise<void> {
  const sessionId = session.id;
  const paymentIntentId = session.payment_intent as string;
  const connectedAccount = session.connected_account;
  const email = session.customer_details?.email || '';

  try {
    // Intentar expandir el payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { stripeAccount: connectedAccount }
    );

    // Verificar que el payment intent existe y tiene metadata
    if (!paymentIntent.metadata) {
      throw new Error("Payment intent metadata not found");
    }

    const metadata = paymentIntent.metadata as {
      assetId: string;
      merchantStripeId: string;
    };

    const assetId = metadata.assetId;
    const merchantStripeId = metadata.merchantStripeId;

    if (!assetId || !merchantStripeId || !email) {
      throw new Error("Missing required metadata in payment intent");
    }

    // Verificar y actualizar el usuario
    const user = await db.user.findUnique({
      where: { email },
      select: { assetIds: true }
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Actualizar el usuario con el asset (dedup)
    const newAssetIds = [...new Set([...(user.assetIds || []), assetId])];
    await db.user.update({
      where: { email },
      data: { assetIds: newAssetIds }
    });

    await logAssetAssignmentAttempt(
      sessionId,
      assetId,
      merchantStripeId,
      email,
      AssetAssignmentStatus.SUCCESS
    );

    logger.info("Successfully assigned asset to user", {
      sessionId,
      assetId,
      email,
      merchantStripeId
    });

  } catch (error) {
    logger.error("Error expanding payment intent", {
      sessionId,
      paymentIntentId,
      error: error instanceof Error ? error.message : String(error)
    });

    // Intentar fallback con metadata de sesión
    const fallbackAssetId = session.metadata?.assetId;
    if (fallbackAssetId && email) {
      try {
        const user = await db.user.findUnique({
          where: { email },
          select: { assetIds: true }
        });

        if (!user) {
          throw new Error("User not found in fallback");
        }

        const fallbackAssetIds = [...new Set([...(user.assetIds || []), fallbackAssetId])];
        await db.user.update({
          where: { email },
          data: { assetIds: fallbackAssetIds }
        });

        await logAssetAssignmentAttempt(
          sessionId,
          fallbackAssetId,
          "", // No merchantStripeId en fallback
          email,
          AssetAssignmentStatus.FALLBACK_SUCCESS
        );

        logger.info("Successfully assigned asset using fallback metadata", {
          sessionId,
          assetId: fallbackAssetId,
          email
        });

      } catch (fallbackError) {
        await logAssetAssignmentAttempt(
          sessionId,
          fallbackAssetId || "",
          "",
          email,
          AssetAssignmentStatus.FALLBACK_FAILED,
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        );

        logger.error("Fallback assignment failed", {
          sessionId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_SIGN!;
  const webhookStripeSignatureHeader = request.headers.get("stripe-signature");
  const body = await request.text();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      webhookStripeSignatureHeader,
      webhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as StripeSession;
        await assignAssetToUser(session, stripe);
        // @todo send notifications
        break;

      case "customer.subscription.created":
        const checkoutSession = event.data.object as StripeSession;
        const email = checkoutSession.customer_email || checkoutSession.customer_details?.email || checkoutSession.metadata.customer_email;
        if (!email) return new Response("No email found", { status: 400 });

        let user = await db.user.findUnique({ where: { email } });
        if (!user) {
          user = await db.user.create({
            data: { email, customer: checkoutSession.customer },
          });
        }
        
        const plan = checkoutSession.metadata.plan;
        if (!plan) return new Response("No plan received", { status: 404 });

        const roles = [...new Set([...(user.roles || []), plan])];
        await db.user.update({
          where: { id: user.id },
          data: { roles, customer: checkoutSession.customer },
        });
        break;

      case "customer.subscription.resumed":
      case "invoice.payment_failed":
      case "invoice.payment_action_required":
      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        const subscriptionUser = await db.user.findFirst({
          where: { 
            stripeIds: {
              has: subscriptionEvent.customer as string
            }
          },
          select: { 
            id: true,
            email: true,
            roles: true
          }
        });
        if (!subscriptionUser) return new Response("User not found", { status: 404 });

        const updatedRoles = await handleSubscriptionEvent(subscriptionEvent, subscriptionUser.roles || []);
        await db.user.update({
          where: { id: subscriptionUser.id },
          data: { roles: updatedRoles }
        });
        break;
    }

    return new Response(null, { status: 200 });

  } catch (error) {
    logger.error("Webhook Error", {
      error: error instanceof Error ? error.message : String(error)
    });
    return new Response("Webhook Error", { status: 400 });
  }
};
