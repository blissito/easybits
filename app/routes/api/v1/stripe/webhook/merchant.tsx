import { type ActionFunctionArgs } from "react-router";
import { getStripe } from "~/.server/stripe";
import { db } from "~/.server/db";

export const action = async ({ request }: ActionFunctionArgs) => {
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
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_SIGN!
    );

    const accountId = event.data.object.id;

    switch (event.type) {
      case "account.updated": {
        const account = event.data.object;
        const user = await db.user.findFirst({
          where: { stripeId: accountId },
        });

        if (!user) {
          return new Response("User not found", { status: 404 });
        }

        // Actualizar rol merchant basado en el estado de la cuenta
        const roles =
          account.charges_enabled && account.payouts_enabled
            ? ["merchant"]
            : [];

        await db.user.update({
          where: { id: user.id },
          data: {
            roles,
          },
        });

        return new Response(null, { status: 200 });
      }

      case "account.application.deauthorized": {
        const user = await db.user.findFirst({
          where: { stripeId: accountId },
        });

        if (!user) {
          return new Response("User not found", { status: 404 });
        }

        // Remove merchant role
        await db.user.update({
          where: { id: user.id },
          data: {
            roles: [],
          },
        });

        return new Response(null, { status: 200 });
      }

      case "payout.paid":
      case "transfer.created":
      case "charge.succeeded":
      case "charge.failed":
        // Handle these events if needed
        return new Response(null, { status: 204 });

      default:
        console.log(`Unhandled event type: ${event.type}`);
        return new Response("Event type not handled", { status: 404 });
    }
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Webhook error", { status: 400 });
  }
};
