import { Stripe } from "stripe";

export const getPublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY;

const stripe = () => {
  const client = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2023-08-16",
  });
  return client;
};

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
