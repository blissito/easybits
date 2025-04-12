import { data, type ActionFunctionArgs } from "react-router";
import { db } from "~/.server/db";
import { getStripe } from "~/.server/stripe";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return;

  const webhookSecret = process.env.STRIPE_SIGN as string;
  const webhookStripeSignatureHeader = request.headers.get(
    "stripe-signature"
  ) as string;
  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      webhookStripeSignatureHeader,
      webhookSecret
    );
  } catch (error) {
    console.error(`Stripe construct event error: ${error}`);
    return data(error, { status: 500 });
  }
  const session = event.data.object;
  const plan = session.metadata.plan;

  switch (event.type) {
    // suscription
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.completed":
    case "customer.subscription.created":
      const email =
        session.customer_email ||
        session.customer_details?.email ||
        session.metadata.customer_email;
      if (!email) return new Response("No email found", { status: 400 });

      let user = await db.user.findUnique({ where: { email } });
      if (!user) {
        user = await db.user.create({
          data: { email, customer: session.customer },
        });
      }
      //   console.info("Subscription::CREATED:: ", plan, email);

      if (!email || !plan)
        return new Response("No email or plan received", { status: 404 });

      const roles = [...new Set([...(user.roles || []), plan])];
      await db.user.update({
        where: { id: user.id },
        data: { roles, customer: session.customer },
      });
      break;
    // resume
    case "customer.subscription.resumed":
    // fail or pause
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
      user = await db.user.findFirst({
        where: {
          customer: session.customer,
        },
      });
      if (!user) return new Response("No user found", { status: 404 });

      await db.user.update({
        where: { id: user.id },
        data: {
          roles: user.roles.filter((r) => r !== "creative" && r !== "expert"),
        },
      });
    // payment
    case "invoice.paid":
    case "checkout.session.async_payment_failed":
      return null;
    default:
      return null;
  }
};
