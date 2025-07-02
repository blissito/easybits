import type { Asset, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { db } from "./db";
import { updateAsset } from "./assets";
import { getStripe } from "~/.server/stripe";

const stripe = getStripe();

type CreateAccountResponse = {
  id: string;
  object: "v2.core.account";
  applied_configurations: ["customer"];
  configuration: string | null;
  contact_email: string;
  created: string;
  dashboard: string | null;
  identity: string | null;
  defaults: string | null;
  display_name: string;
  metadata: {};
  requirements: string | null;
  livemode: boolean;
};
type Capabilities = {
  card_payments: "inactive" | "active";
  transfers: "inactive" | "active";
};

export type Payment = {
  id: string;
};
//   capabilities: { card_payments: 'inactive', transfers: 'inactive' },

const location =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://www.easybits.cloud";

const webhookUrl = `${location}/api/v1/stripe/webhook/merchant`;
const stripeURL = "https://api.stripe.com/v2/core/accounts";
const accountSessionsURL = "https://api.stripe.com/v1/account_sessions";
const accountsURL = "https://api.stripe.com/v2/core/accounts";
const paymentsURL = "https://api.stripe.com/v1/payment_intents";
const productsURL = "https://api.stripe.com/v1/products";
const pricesURL = "https://api.stripe.com/v1/prices";
const apiKey = `Bearer ${process.env.STRIPE_SECRET_KEY}`; // prod
const checkoutSessionsURL = "https://api.stripe.com/v1/checkout/sessions";
const version = "2025-04-30.preview";

export async function configureMerchantWebhook(
  userId: string,
  assetId: string
) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeId: true },
    });

    if (!user?.stripeId) {
      throw new Error("User doesn't have a Stripe account");
    }

    // Usar la API REST en lugar del SDK
    const stripeWebhookApiUrl = "https://api.stripe.com/v1/webhook_endpoints";
    const params = new URLSearchParams({
      url: webhookUrl,
      enabled_events: [
        "account.updated",
        "charge.succeeded",
        "charge.failed",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_intent.canceled",
        "payment_intent.processing",
      ].join(","),
      stripe_account: user.stripeId,
      connect: "true",
    });

    const response = await fetch(stripeWebhookApiUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const webhook = await response.json();
    return webhook;
  } catch (error) {
    console.error("Error configuring merchant webhook:", error);
    throw error;
  }
}

export const createCheckoutURL = async (assetId: string, accountId: string) => {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Response("Asset not found", { status: 404 });

  if (!asset.stripePrice)
    throw new Response("StripePrice not found", { status: 404 });

  // Crear la sesión de checkout
  const url = new URL(checkoutSessionsURL);
  url.searchParams.set("mode", `payment`);
  url.searchParams.set("line_items[0][quantity]", "1");
  url.searchParams.set("line_items[0][price]", asset.stripePrice);
  url.searchParams.set("success_url", `${location}/api/v1/stripe/success`);

  const sessionRes = await fetch(url.toString(), {
    method: "post",
    headers: {
      Authorization: apiKey,
      "Stripe-Account": accountId,
      "Stripe-Version": "2025-04-30.preview",
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  const sessionData = await sessionRes.json();

  // Actualizar metadata del PaymentIntent con checkout_session y assetId
  if (sessionData.payment_intent && sessionData.id) {
    const piUrl = `https://api.stripe.com/v1/payment_intents/${sessionData.payment_intent}`;
    const params = new URLSearchParams();
    params.set("metadata[checkout_session]", sessionData.id);
    params.set("metadata[assetId]", assetId);
    await fetch(piUrl, {
      method: "post",
      headers: {
        Authorization: apiKey,
        "Stripe-Account": accountId,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  }

  return sessionData.url;
};

export const updateOrCreateProductAndPrice = async (
  asset: Asset,
  request: Request
) => {
  // @todo add description from "notas sobre el producto"
  const user = await getUserOrNull(request);
  if (!user) return;

  const accountId = user.stripeId;
  if (!accountId) return;

  console.log("About to create price");

  if (asset.stripeProduct && asset.stripePrice) {
    // @todo create price & assign new price to product
    const price = await createNewPriceForProduct({
      productId: asset.stripeProduct,
      accountId,
      currency: asset.currency as "mxn", // @todo: all others
      unit_amount: Number(asset.price) * 100, // cents
    });
    console.info("::STRIPE_PRICE::NEW_PRICE::", price);
    await updateProduct({
      productId: asset.stripeProduct,
      priceId: price.id,
      accountId,
      images: [],
    });
    await updateAsset(asset.id, { stripePrice: price.id });
    // Configurar webhook después de crear el price
    await configureMerchantWebhook(user.id, asset.id);
  } else {
    const product = await createProductAndPrice(
      asset.slug,
      Number(asset.price),
      asset.currency,
      accountId
    ); // @todo iterate slug?
    await db.asset.update({
      where: {
        id: asset.id,
      },
      data: { stripeProduct: product.id, stripePrice: product.default_price },
    });
    // Configurar webhook después de crear el price
    await configureMerchantWebhook(user.id, asset.id);
  }
};

export const updateProduct = async ({
  productId,
  accountId,
  priceId,
  images = [],
  description,
}: {
  accountId: string;
  productId: string;
  images: string[];
  description?: string;
  priceId?: string;
}) => {
  const url = new URL(`${productsURL}/${productId}`);
  priceId && url.searchParams.set("default_price", priceId);
  description && url.searchParams.set("description", description);
  // array
  images.length > 0 &&
    images.forEach((link) => {
      url.searchParams.append("images[]", link);
    });

  return await fetch(url.toString(), {
    method: "post",
    headers: {
      Authorization: apiKey,
      "Stripe-Account": accountId,
      "Stripe-Version": "2025-04-30.preview",
      "content-type": "application/x-www-form-urlencoded",
    },
  })
    .then((r) => r.json())
    .catch((e) => console.error("::STRIPE::ERROR::", e));
};

// @todo can't be updated, we should archive and create new one...
const createNewPriceForProduct = async ({
  productId,
  currency,
  unit_amount,
  accountId,
}: {
  productId: string;
  currency: "mxn";
  unit_amount: number;
  accountId: string;
}) => {
  const url = new URL(pricesURL);
  // url.searchParams.set("currency", currency);
  url.searchParams.set(`currency`, currency); // in cents
  url.searchParams.set(`unit_amount`, String(unit_amount)); // in cents?
  url.searchParams.set(`product`, productId); // in cents
  const headers = {
    Authorization: apiKey,
    "Stripe-Account": accountId,
    "Stripe-Version": "2025-04-30.preview",
    "content-type": "application/x-www-form-urlencoded",
  };
  const price = fetch(url.toString(), { headers, method: "post" })
    .then((r) => r.json())
    .catch((e) => console.error("::STRIPE::ERROR::", e));
  return price;
};

const createProductAndPrice = async (
  name: string,
  price: number,
  currency: string,
  accountId: string
) => {
  const url = new URL(productsURL);
  url.searchParams.set("name", name);
  url.searchParams.set("default_price_data[currency]", currency);
  url.searchParams.set("default_price_data[unit_amount]", String(price * 100));
  const headers = {
    Authorization: apiKey,
    "Stripe-Account": accountId,
    "Stripe-Version": "2025-04-30.preview",
    "content-type": "application/x-www-form-urlencoded",
  };
  const data = fetch(url.toString(), { headers, method: "post" })
    .then((r) => r.json())
    .catch((e) => console.error("::STRIPE::ERROR::", e));
  return data;
};

export const getAccountPayments = async (accountId: string, isDev: boolean) => {
  const url = new URL(paymentsURL);
  const Authorization = `Bearer ${
    isDev ? process.env.STRIPE_DEV_SECRET_KEY : apiKey
  }`;
  const headers = {
    Authorization,
    "content-type": "application/x-www-form-urlencoded",
    "Stripe-Account": accountId,
    "Stripe-Version": "2025-04-30.preview",
  };
  const response = await fetch(url.toString(), { headers });
  const json = await response.json();
  console.info("payments", json);
  return json.data;
};

export const createClientSecret = async ({
  accountId,
  onboarding,
  payments,
}: {
  accountId: string;
  onboarding: boolean;
  payments: boolean;
}) => {
  const url = new URL(accountSessionsURL);
  url.searchParams.set("account", accountId);
  onboarding &&
    url.searchParams.set("components[account_onboarding][enabled]", "true");
  payments && url.searchParams.set("components[payments][enabled]", "true");
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  //   console.log("Account session", data);
  return data.client_secret;
};

export const getAccountCapabilities = async (
  accountId?: string,
  isDev: boolean = false
): Promise<Capabilities | null> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}`);
  // url.searchParams.append("include", "identity");
  url.searchParams.set("include", "configuration.merchant");
  const Authorization = `Bearer ${
    isDev ? process.env.STRIPE_DEV_SECRET_KEY : apiKey
  }`;
  const response = await fetch(url.toString(), {
    headers: {
      "Stripe-Version": version,
      Authorization,
    },
  });
  const data = await response.json();
  return data.configuration?.merchant?.capabilities;
};

export const findOrCreateStripeAccountV2 = async (email: string) => {
  let { stripeId } =
    (await db.user.findUnique({
      where: {
        email,
      },
      select: {
        stripeId: true,
      },
    })) || {};

  if (!stripeId) {
    const { id: accountId } = await createAccountV2({ email } as User);
    await db.user.upsert({
      where: {
        email,
      },
      create: { stripeId: accountId, email, confirmed: true },
      update: { stripeId: accountId },
    });
    stripeId = accountId;
  }
  return getStripeAccount(stripeId);
};

export const getStripeAccount = async (accountId: string) => {
  const url = new URL(accountsURL + `/${accountId}`);
  // url.searchParams.set("include", "capabilities");
  const response = await fetch(url.toString(), getInit());
  const data = await response.json();
  return data;
};

export const createPaymentsSession = async (accountId: string) => {
  const url = new URL(accountSessionsURL);
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  //   console.log("Account session", data);
  return data.client_secret;
};

export const createOnboarding = async (accountId: string): Promise<string> => {
  const url = new URL(accountSessionsURL);
  url.searchParams.set("account", accountId);
  url.searchParams.set("components[account_onboarding][enabled]", "true");
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  //   console.log("Account session", data);
  return data.client_secret;
};

export const createAccountV2 = async (
  user: User
): Promise<CreateAccountResponse> => {
  const body = JSON.stringify({
    display_name: user.displayName,
    contact_email: user.email,
    identity: {
      country: "mx", // @todo from onboarding?
      entity_type: "individual", // same
    },
    include: [
      "configuration.customer",
      "configuration.merchant",
      "identity",
      "requirements",
    ],
    dashboard: "full",
    defaults: {
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
      locales: ["es"],
    },
    configuration: {
      // customer: {},
      //   recipient: {
      //     capabilities: {
      //       stripe_balance: {
      //         stripe_transfers: {
      //           requested: true,
      //         },
      //       },
      //     },
      //   },
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },
  });
  const init: RequestInit = {
    method: "post",
    headers: {
      "Stripe-Version": version,
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body,
  };
  const response = await fetch(stripeURL, init);
  const data = await response.json();
  return data;
};

const getInit = (body: any = {}, headers: any = {}) =>
  ({
    method: "post",
    headers: {
      "Stripe-Version": version,
      Authorization: apiKey,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  } as RequestInit);
