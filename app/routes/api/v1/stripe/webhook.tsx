import { data, type ActionFunctionArgs } from "react-router";
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
  switch (event.type) {
    // suscription
    case "customer.subscription.created":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "invoice.paid":
    // payment
    case "checkout.session.async_payment_failed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.completed":
      return null;
    default:
      return null;
  }
};
