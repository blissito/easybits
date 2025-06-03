import type { User } from "@prisma/client";

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

const stripeURL = "https://api.stripe.com/v2/core/accounts";
const accountSessionsURL = "https://api.stripe.com/v1/account_sessions";
const accountsURL = "https://api.stripe.com/v1/accounts";
const paymentsURL = "https://api.stripe.com/v1/payment_intents";
const apiKey = `Bearer ${process.env.STRIPE_SECRET_KEY}`;
const version = "2025-04-30.preview";

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

export const getStripeCapabilities = async (
  accountId?: string
): Promise<Capabilities | null> => {
  if (!accountId) return null;

  const account = await getStripeAccount(accountId);
  return account.capabilities;
};

const getStripeAccount = async (accountId: string) => {
  const url = new URL(accountsURL + `/${accountId}`);
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
      customer: {},
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
