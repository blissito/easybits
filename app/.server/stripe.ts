import { Stripe } from "stripe";

export const getPublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY;

let stripe;
export const getStripe = (key?: string) => {
  stripe ??= new Stripe(key || (process.env.STRIPE_SECRET_KEY as string), {
    apiVersion: "2023-08-16",
  });
  return stripe;
};

const isDev = process.env.NODE_ENV === "development";
export const getStripeCheckout = async (options: {
  coupon?: string;
  customer_email?: string;
  assetId?: string;
  priceId?: string;
  secret?: string;
  plan?: string;
}) => {
  const { plan, customer_email, priceId, secret } = options || {};

  // const asset = await db.asset.findUnique({where:{id:assetId}}) // @todo for assets

  const location = isDev
    ? "http://localhost:3000"
    : "https://www.easybits.cloud"; // @todo move to envs?
  const successURL = `${location}/api/v1/stripe/plans?priceId=${priceId}&customer_email=${customer_email}`;
  const session = await getStripe(secret).checkout.sessions.create({
    metadata: {
      customer_email,
      priceId,
      plan,
    },
    customer_email,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${successURL}&success=1`,
    cancel_url: `${successURL}&success=0`,
    discounts: options.coupon ? [{ coupon: options.coupon }] : undefined,
    allow_promotion_codes: options.coupon ? undefined : true,
    // <= @todo multi moneda?
  });
  return session.url || "/404";
};

export const createAccountSession = async ({ account }) => {
  try {
    const accountSession = await getStripe().accountSessions.create({
      account: account,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
      },
    });
    console.log({ accountSession });
    return accountSession.client_secret;
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account session",
      error
    );
    throw error.message;
  }
};

export const createAccount = async () => {
  try {
    const account = await getStripe().accounts.create({
      controller: {
        stripe_dashboard: {
          type: "none",
        },
        fees: {
          payer: "application",
        },
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      country: "MX",
    });
    return account;
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account",
      error
    );
    throw error.message;
  }
};
