import { Stripe } from "stripe";
import { config } from "./config";

export const getPublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY;

/*
 * initiate stripe
 */
const stripe = () => {
  const client = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2023-08-16",
  });
  return client;
};

/*
 * create account session
 */
export const createAccountSession = async ({ account }) => {
  try {
    const accountSession = await stripe().accountSessions.create({
      account: account,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
      },
    });
    return accountSession.client_secret;
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account session",
      error
    );
    throw error.message;
  }
};

/**
 *
 * create account
 */
export const createAccount = async () => {
  try {
    const account = await stripe().accounts.create({
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

/**
 * create checkout session
 */

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys

export const createCheckoutSession = async ({ stripeAccount, asset }) => {
  const { slug, price, name, currency } = asset;
  const applicationFee = price * 0.1;
  const session = await stripe().checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${name}-${id} `,
            },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
      },
      mode: "payment",
      ui_mode: "embedded",
      return_url: `${config.baseUrl}/p/${slug}?session_id={CHECKOUT_SESSION_ID}`,
    },
    {
      stripeAccount,
    }
  );

  return session;
};
