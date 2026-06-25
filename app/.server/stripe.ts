import { Stripe } from "stripe";
import { config } from "./config";

export const getPublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY;

let stripe;
export const getStripe = (key?: string) => {
  stripe ??= new Stripe(key || (process.env.STRIPE_SECRET_KEY as string), {
    apiVersion: "2023-08-16",
  });
  return stripe;
};
const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud"; // @todo move to envs? // we have this in ./config file

export const createPortalSessionURL = (customer?: string | null) => {
  if (!customer) return null;

  return getStripe().billingPortal.sessions.create({
    customer: customer,
    return_url: `${location}/dash/perfil`,
  });
};

export const retrieveCustomer = (id: string) => {
  return getStripe().customers.retrieve(id);
};

export const getStripeCheckout = async (options: {
  coupon?: string;
  customer_email?: string;
  assetId?: string;
  priceId?: string;
  secret?: string;
  plan?: string;
}) => {
  const { plan, customer_email, priceId, secret } = options || {};

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

/**
 * Create a one-time checkout session for a generation or LLM token pack.
 */
export const createPackCheckout = async ({
  userId,
  email,
  packId,
  generations,
  tokens,
  priceMxn,
  type = "generation_pack",
  autoTopup = false,
}: {
  userId: string;
  email: string;
  packId: string;
  generations?: number;
  tokens?: number;
  priceMxn: number;
  /** "generation_pack" (default) | "llm_token_pack" */
  type?: "generation_pack" | "llm_token_pack";
  /** Si true: guarda la tarjeta off-session y activa auto-topup tras la compra. */
  autoTopup?: boolean;
}) => {
  const isLlm = type === "llm_token_pack";
  const tokenCount = tokens ?? 0;
  const creditCount = generations ?? 0;

  const productName = isLlm
    ? `Pack de ${tokenCount.toLocaleString("es-MX")} tokens LLM`
    : `Pack de ${creditCount} créditos AI`;

  const metadata: Record<string, string> = {
    type,
    userId,
    packId,
  };
  if (isLlm) {
    metadata.tokens = String(tokenCount);
  } else {
    metadata.generations = String(creditCount);
  }
  if (autoTopup) metadata.autoTopup = "1";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    metadata,
    // Para auto-topup: crear un Customer reutilizable y guardar la tarjeta
    // para cobros off-session futuros.
    ...(autoTopup && {
      customer_creation: "always",
      payment_intent_data: { setup_future_usage: "off_session" },
    }),
    line_items: [
      {
        price_data: {
          currency: "mxn",
          product_data: {
            name: productName,
          },
          unit_amount: priceMxn * 100, // Stripe expects centavos
        },
        quantity: 1,
      },
    ],
    success_url: `${location}/dash/packs?success=1`,
    cancel_url: `${location}/dash/packs?cancelled=1`,
  });
  return session.url || "/404";
};

/**
 * Recurring monthly Checkout for a RESERVED pool sandbox (packs → Sandboxes tab).
 *
 * subscription mode → a dedicated subscription per reservation, so cancelling it
 * cleanly frees the capacity without touching the user's plan subscription. The
 * `type: reserved_sandbox` metadata (on BOTH the session and the subscription)
 * is what the webhook keys off to record/cancel the reservation.
 */
export const createSandboxReservationCheckout = async ({
  userId,
  email,
  tier,
  quantity,
  priceMxn,
  agents,
}: {
  userId: string;
  email: string;
  tier: string;
  /** Number of identical pool boxes to bill. */
  quantity: number;
  /** Price per box (MXN/month). */
  priceMxn: number;
  /** Total agent slots granted (4 × quantity). */
  agents: number;
}) => {
  const metadata = { type: "reserved_sandbox", userId, tier, agents: String(agents) };
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    metadata,
    subscription_data: { metadata },
    line_items: [
      {
        price_data: {
          currency: "mxn",
          product_data: { name: `Caja del pool (${agents / quantity} agentes c/u)` },
          recurring: { interval: "month" },
          unit_amount: priceMxn * 100, // centavos
        },
        quantity,
      },
    ],
    success_url: `${location}/dash/packs?success=1&tab=sandboxes`,
    cancel_url: `${location}/dash/packs?cancelled=1&tab=sandboxes`,
  });
  return session.url || "/404";
};

/*
 * create account session
 */
export const createAccountSession = async ({ account }: { account: string }) => {
  try {
    const accountSession = await getStripe().accountSessions.create({
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
    throw (error as Error).message;
  }
};

/**
 *
 * create account
 */
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
      webhook_endpoint: {
        url: `${location}/api/v1/stripe/webhook/merchant`,
        enabled_events: [
          "checkout.session.completed",
          "payment_intent.succeeded",
          "payment_intent.created",
        ],
      },
    });
    return account;
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account",
      error
    );
    throw (error as Error).message;
  }
};

/**
 * retreive an account to check its status in stripe
 */

export const fetchAccount = async ({ accountId }: { accountId: string }) => {
  try {
    const account = await getStripe().accounts.retrieve(accountId);
    return account;
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account",
      error
    );
    return (error as Error).message;
  }
};

/**
 * create checkout session
 */

export const createCheckoutSession = async ({
  stripeAccount,
  asset,
}: {
  stripeAccount: string;
  asset: {
    slug: string;
    price: number;
    title?: string | null;
    currency: string;
    id: string;
    user?: { email: string } | null;
  };
}) => {
  const { slug, price, title, currency, id, user } = asset;
  const email = user?.email;
  const applicationFee = price * 0.5 * 100;
  const session = await getStripe().checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: title || slug,
            },
            unit_amount: asset.price,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        metadata: {
          assetId: id,
          email: email || undefined,
        },
      },
      mode: "payment",
      ui_mode: "embedded",
      return_url: `${config.baseUrl}/p/${slug}?session_id={CHECKOUT_SESSION_ID}`,
      expand: ["payment_intent"],
    },
    {
      stripeAccount,
    }
  );

  return session;
};
