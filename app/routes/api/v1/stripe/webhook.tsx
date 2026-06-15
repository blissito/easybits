// @ts-nocheck
import { getStripe } from "~/.server/stripe";
import { db } from "~/.server/db";
import { default as logger } from "~/.server/logger";
import { processReferralUpgrade } from "~/.server/core/referralOperations";
import type { StripeSession } from "~/.server/types/stripe";
import type { ActionFunctionArgs } from "~/.server/types/react-router";
import Stripe from "stripe";
import { isPaidPlan, normalizePlan, GENERATION_PACKS } from "~/lib/plans";
import { creditPack } from "~/.server/core/creditPack";

/**
 * Persist auto-topup config after a pack checkout where the user opted in.
 * Reads the saved payment method from the session's PaymentIntent and stores
 * customer + PM + config so future off-session charges can run.
 */
async function saveAutoTopupFromSession(session, userId, packId) {
  try {
    const customer =
      typeof session.customer === "string" ? session.customer : null;
    let paymentMethod: string | null = null;
    const piId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;
    if (piId) {
      const pi = await getStripe().paymentIntents.retrieve(piId);
      paymentMethod =
        typeof pi.payment_method === "string" ? pi.payment_method : null;
    }
    // Preservar chargeEpoch al reactivar: NO resetear a 0. Si un intento previo
    // falló con epoch=N, reusar epoch=N produciría una idempotency key colisionada
    // (Stripe devolvería el decline cacheado). El epoch es monotónico por usuario.
    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { autoTopup: true },
    });
    const chargeEpoch = existing?.autoTopup?.chargeEpoch ?? 0;
    await db.user.update({
      where: { id: userId },
      data: {
        ...(customer && { customer }),
        autoTopup: {
          enabled: true,
          packId,
          paymentMethod,
          charging: false,
          chargeEpoch,
          lastTopupAt: null,
          failedAt: null,
          lastError: null,
        },
      },
    });
    logger.info("Auto-topup enabled", { userId, packId, hasPM: !!paymentMethod });
  } catch (e) {
    logger.error("saveAutoTopupFromSession failed", {
      userId,
      packId,
      error: String(e),
    });
  }
}

const PLAN_ROLES = ["Byte", "Mega", "Tera", "Spark", "Flow", "Studio"];

/** Remove all plan roles from user (used on cancellation/update) */
function stripPlanRoles(roles: string[]): string[] {
  return roles.filter((r) => !PLAN_ROLES.includes(r));
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

        // Handle pack purchase (generation OR llm token) — unified path.
        if (
          session.metadata?.type === "generation_pack" ||
          session.metadata?.type === "llm_token_pack"
        ) {
          const packUserId = session.metadata.userId;
          const packId = session.metadata.packId;
          const packEmail =
            session.customer_details?.email || session.customer_email || "";
          const price =
            session.amount_total != null ? session.amount_total / 100 : undefined;
          if (packUserId && packId) {
            await creditPack({
              userId: packUserId,
              packId,
              email: packEmail,
              pricePaid: price,
              currency: session.currency || "mxn",
              channel: "purchase",
            });

            // Opt-in to auto-topup: persist saved card + config. The PaymentIntent
            // saved the card off-session (setup_future_usage); read its PM here.
            if (session.metadata.autoTopup === "1") {
              await saveAutoTopupFromSession(session, packUserId, packId);
            }
          }
          break;
        }

        // Handle plan upgrade (subscription mode). The session is the only
        // event with both metadata.plan AND customer_details.email — older
        // code tried to read these from customer.subscription.created (which
        // is a Subscription object lacking both), causing 100% silent fails.
        if (session.mode === "subscription" && session.metadata?.plan) {
          const planKey = session.metadata.plan as string;
          const planEmail =
            session.customer_details?.email || session.customer_email || null;
          const planCustomerId =
            typeof session.customer === "string" ? session.customer : null;

          if (!planEmail || !planCustomerId) {
            logger.error("Plan upgrade missing email or customer", {
              sessionId: session.id,
              planEmail,
              planCustomerId,
            });
            break;
          }

          let planUser = await db.user.findUnique({ where: { email: planEmail } });
          if (!planUser) {
            planUser = await db.user.create({
              data: {
                email: planEmail,
                customer: planCustomerId,
                stripeIds: [planCustomerId],
              },
            });
          }

          const newRoles = [...stripPlanRoles(planUser.roles || []), planKey];
          const newStripeIds = (planUser.stripeIds || []).includes(planCustomerId)
            ? planUser.stripeIds
            : [...(planUser.stripeIds || []), planCustomerId];

          await db.user.update({
            where: { id: planUser.id },
            data: {
              roles: newRoles,
              customer: planCustomerId,
              stripeIds: newStripeIds,
            },
          });

          if (isPaidPlan(normalizePlan(planKey))) {
            await processReferralUpgrade(planUser.id);
          }

          logger.info("Plan upgrade processed", {
            sessionId: session.id,
            userId: planUser.id,
            plan: planKey,
          });
          break;
        }

        await assignAssetToUser(session, stripe);
        // @todo send notifications
        break;

      case "customer.subscription.resumed":
      case "invoice.payment_failed":
      case "invoice.payment_action_required":
      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        const custId = subscriptionEvent.customer as string;
        const subscriptionUser = await db.user.findFirst({
          where: { stripeIds: { has: custId } },
          select: { id: true, email: true, roles: true },
        });
        if (!subscriptionUser) return new Response("User not found", { status: 404 });

        // On cancellation/failure, remove plan roles so user falls back to Byte
        if (
          event.type === "customer.subscription.deleted" ||
          event.type === "invoice.payment_failed"
        ) {
          await db.user.update({
            where: { id: subscriptionUser.id },
            data: { roles: stripPlanRoles(subscriptionUser.roles || []) },
          });
        }
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
