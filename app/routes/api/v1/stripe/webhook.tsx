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

        // Handle reserved fleet sandbox (subscription mode). Records the
        // capacity grant; the fleet consumes it on demand. Keyed off the
        // session metadata set by createSandboxReservationCheckout.
        if (session.metadata?.type === "reserved_sandbox") {
          const resOwnerId = session.metadata.userId;
          const resTier = session.metadata.tier;
          const resAgents = parseInt(session.metadata.agents || "0", 10) || 0;
          const subId =
            typeof session.subscription === "string" ? session.subscription : null;
          if (resOwnerId && resTier && subId) {
            const { recordReservation } = await import(
              "~/.server/core/sandboxReservations"
            );
            await recordReservation({
              ownerId: resOwnerId,
              tier: resTier,
              agents: resAgents,
              stripeSubscriptionId: subId,
            });
            logger.info("Sandbox reservation recorded", {
              sessionId: session.id,
              userId: resOwnerId,
              tier: resTier,
            });
          }
          break;
        }

        // Handle plan upgrade (subscription mode). The session is the only
        // event with both metadata.plan AND customer_details.email — older
        // code tried to read these from customer.subscription.created (which
        // is a Subscription object lacking both), causing 100% silent fails.
        // Standalone hosting: the machine is its own subscription (no platform
        // plan involved). This is where the box is actually born — provisioning
        // only after Stripe confirms payment means nobody ever gets free
        // compute, and an abandoned checkout leaves nothing behind.
        if (session.mode === "subscription" && session.metadata?.eb_machine === "1") {
          const md = session.metadata;
          const subId = typeof session.subscription === "string" ? session.subscription : null;
          if (!subId || !md.eb_user_id) {
            logger.error("Machine checkout missing subscription or user", { sessionId: session.id });
            break;
          }
          try {
            const { provisionPaidMachine } = await import("~/.server/core/machineOperations");
            const created = await provisionPaidMachine({
              ownerId: md.eb_user_id,
              subscriptionId: subId,
              tier: md.eb_tier,
              cpuMode: (md.eb_cpu_mode === "reserved" ? "reserved" : "shared") as "shared" | "reserved",
              diskAddonsGB: Number(md.eb_disk_addons || 0),
              template: md.eb_template || undefined,
              name: md.eb_name || undefined,
            });
            logger.info("Machine provisioned from checkout", {
              sandboxId: created?.sandboxId ?? null,
              subscriptionId: subId,
            });
          } catch (e) {
            // They paid. Never swallow this.
            logger.error("Machine provisioning from checkout FAILED", {
              sessionId: session.id,
              subscriptionId: subId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }

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
          // Escribir también metadata.plan (merge, no pisar el resto) para que el
          // plan no viva SOLO en roles[]. getUserPlan honra ambos.
          const newMetadata = {
            ...((planUser.metadata as Record<string, unknown>) || {}),
            plan: planKey,
          };

          await db.user.update({
            where: { id: planUser.id },
            data: {
              roles: newRoles,
              metadata: newMetadata,
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

        // Reserved-sandbox subscriptions ride their OWN subscription (not the
        // plan). Deleting one frees the capacity grant — and must NOT strip the
        // user's plan roles, so short-circuit before the plan handling below.
        if (subscriptionEvent.metadata?.type === "reserved_sandbox") {
          if (event.type === "customer.subscription.deleted") {
            const { cancelReservationBySubscription } = await import(
              "~/.server/core/sandboxReservations"
            );
            await cancelReservationBySubscription(subscriptionEvent.id);
            logger.info("Sandbox reservation cancelled", {
              subscriptionId: subscriptionEvent.id,
            });
          }
          break;
        }

        // Standalone hosting subscription. MUST short-circuit: the plan
        // handling below strips plan roles on cancellation, so without this a
        // customer who cancels a $99 VPS would silently lose the Tera plan
        // they still pay for.
        if (subscriptionEvent.metadata?.eb_machine === "1") {
          if (
            event.type === "customer.subscription.deleted" ||
            event.type === "invoice.payment_failed"
          ) {
            const { releaseMachineBySubscription } = await import(
              "~/.server/core/machineOperations"
            );
            await releaseMachineBySubscription(subscriptionEvent.id);
            logger.info("Hosting machine released by subscription end", {
              subscriptionId: subscriptionEvent.id,
            });
          }
          break;
        }

        // Esta cuenta de Stripe sirve a VARIAS apps (fixtergeek.com, animaciones,
        // aio…), así que aquí entran suscripciones que no son de EasyBits. Las
        // nuestras siempre llevan marca: `plan` la pone el checkout de planes
        // (plans.tsx:23) y `eb_machine` el de hosting.
        //
        // Sin este filtro, un pago fallido de OTRO producto le quitaría el plan
        // a un usuario de EasyBits que compartiera customer — y encima le
        // suspendería sus máquinas. Ante la duda no se toca nada: dejar un plan
        // de más es recuperable, quitárselo a quien paga no.
        if (!subscriptionEvent.metadata?.plan) {
          logger.info("Stripe subscription event from another product; ignoring", {
            subscriptionId: subscriptionEvent.id,
            eventType: event.type,
          });
          return new Response("Not an EasyBits subscription; nothing to do", { status: 200 });
        }

        const custId = subscriptionEvent.customer as string;
        const subscriptionUser = await db.user.findFirst({
          where: { stripeIds: { has: custId } },
          select: { id: true, email: true, roles: true, metadata: true },
        });
        if (!subscriptionUser) {
          // 2xx a propósito: no hay nada que hacer con un evento de alguien que
          // no está en nuestra base, y Stripe REINTENTA durante 3 días cualquier
          // respuesta que no sea 2xx. Un usuario inexistente no aparece por
          // reintentar — solo llena la cola y esconde fallos de verdad.
          logger.warn("Stripe subscription event for an unknown customer", {
            customerId: custId,
            eventType: event.type,
          });
          return new Response("No user for this customer; nothing to do", { status: 200 });
        }

        // On cancellation/failure, remove plan roles AND reset metadata.plan so
        // both sources fall back to Byte consistentemente.
        if (
          event.type === "customer.subscription.deleted" ||
          event.type === "invoice.payment_failed"
        ) {
          await db.user.update({
            where: { id: subscriptionUser.id },
            data: {
              roles: stripPlanRoles(subscriptionUser.roles || []),
              metadata: {
                ...((subscriptionUser.metadata as Record<string, unknown>) || {}),
                plan: "Byte",
              },
            },
          });
          // Plan lapsed → pause the owner's always-on machines (their billing
          // items ride on this subscription). Best-effort, non-blocking.
          const { suspendOwnerSandboxes } = await import("~/.server/core/machineOperations");
          await suspendOwnerSandboxes(subscriptionUser.id).catch((e) =>
            logger.error("suspendOwnerSandboxes failed", {
              userId: subscriptionUser.id,
              error: e instanceof Error ? e.message : String(e),
            })
          );
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
