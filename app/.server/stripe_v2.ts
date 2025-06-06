import type { Asset, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { db } from "./db";

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

type StripeProduct = {
  id: string;
  object: "product";
  active: true;
  attributes: [];
  created: number;
  default_price: null;
  description: null;
  images: [];
  livemode: false;
  marketing_features: [];
  metadata: {};
  name: string;
  package_dimensions: null;
  shippable: null;
  statement_descriptor: null;
  tax_code: null;
  type: "service";
  unit_label: null;
  updated: number;
  url: null;
};

export type Payment = {
  id: string;
};
//   capabilities: { card_payments: 'inactive', transfers: 'inactive' },

const stripeURL = "https://api.stripe.com/v2/core/accounts";
const accountSessionsURL = "https://api.stripe.com/v1/account_sessions";
const accountsURL = "https://api.stripe.com/v2/core/accounts";
const paymentsURL = "https://api.stripe.com/v1/payment_intents";
const productsURL = "https://api.stripe.com/v1/products";
const pricesURL = "https://api.stripe.com/v1/prices";
const apiKey = `Bearer ${process.env.STRIPE_SECRET_KEY}`;
const version = "2025-04-30.preview";

export const updateOrCreateProductAndPrice = async (
  asset: Asset,
  request: Request
) => {
  // @todo add description from "notas sobre el producto"
  const user = await getUserOrNull(request);
  if (!user) return;

  const accountId = user.stripeId;
  if (!accountId) return;

  console.log("Aquí!", asset.stripeProduct && asset.stripePrice);
  if (asset.stripeProduct && asset.stripePrice) {
    // @todo
    const price = await updatePrice(asset.stripePrice, {
      accountId,
      price: Number(asset.price),
      currency: asset.currency,
    });
    console.info("::STRIPE_PRICE::UPDATED::", price);
  } else {
    // create everything & update asset
    /**
     * 1. create product & price
     * 2. update asset
     */

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
  }
};

// @todo can't be updated, we should archive and create new one...
const updatePrice = async (
  priceId: string,
  options: {
    accountId: string;
    price: number;
    currency: string;
  }
) => {
  const { accountId, price, currency } = options || {};
  const url = new URL(`${pricesURL}/${priceId}`);
  // url.searchParams.set("currency", currency);
  url.searchParams.set(`unit_amount`, String(price * 100)); // in cents
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

export const getAccountPayments = async (accountId: string) => {
  const url = new URL(paymentsURL);
  const headers = {
    Authorization: apiKey,
    "content-type": "application/x-www-form-urlencoded",
    "Stripe-Account": accountId,
    "Stripe-Version": "2025-04-30.preview",
  };
  const response = await fetch(url.toString(), { headers });
  const data = await response.json();
  // console.log("CHARGES??", data);
  return data.client_secret;
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
  accountId?: string
): Promise<Capabilities | null> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}`);
  // url.searchParams.append("include", "identity");
  url.searchParams.append("include", "configuration.merchant");
  const response = await fetch(url.toString(), getInit());
  const data = await response.json();
  console.log("ACCOUNT_FOUND::", data);
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
