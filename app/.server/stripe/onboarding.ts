import { db } from "../db";
import type { User } from "@prisma/client";

// Configuración de Stripe
const isDev = process.env.NODE_ENV === "development";
const getAuthHeader = (useDev: boolean = false) => {
  const key =
    useDev || isDev
      ? process.env.STRIPE_DEV_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
  return `Bearer ${key}`;
};

const accountsURL = "https://api.stripe.com/v2/core/accounts";
const accountSessionsURL = "https://api.stripe.com/v1/account_sessions";
const version = "2025-04-30.preview";

type Capabilities = {
  card_payments: "inactive" | "active";
  transfers: "inactive" | "active";
};

type CreateAccountResponse = {
  id: string;
  object: "v2.core.account";
  applied_configurations: ["customer"];
  configuration: string | null;
  contact_email: string;
  created: string;
  dashboard: string;
  livemode: boolean;
};

export const createAccountV2 = async (
  user: User,
  useDev: boolean = false
): Promise<CreateAccountResponse> => {
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(accountsURL, {
    method: "POST",
    headers: {
      "Stripe-Version": version,
      Authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      applied_configurations: "customer",
      contact_email: user.email,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error creating account:", errorText);
    throw new Error(`Failed to create account: ${response.status}`);
  }

  return response.json();
};

export const createOnboarding = async (
  accountId: string,
  useDev: boolean = false
): Promise<{ client_secret: string }> => {
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(accountSessionsURL, {
    method: "POST",
    headers: {
      "Stripe-Version": version,
      Authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      account: accountId,
      return_url: "https://easybits.com/sales",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error creating onboarding:", errorText);
    throw new Error(`Failed to create onboarding: ${response.status}`);
  }

  return response.json();
};

export const createClientSecret = async (
  accountId: string,
  useDev: boolean = false
): Promise<{ client_secret: string }> => {
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(accountSessionsURL, {
    method: "POST",
    headers: {
      "Stripe-Version": version,
      Authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      account: accountId,
      return_url: "https://easybits.com/sales",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error creating client secret:", errorText);
    throw new Error(`Failed to create client secret: ${response.status}`);
  }

  return response.json();
};

export const getAccountPayments = async (
  accountId?: string,
  useDev: boolean = false
): Promise<any> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}/payments`);
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(url.toString(), {
    headers: {
      "Stripe-Version": version,
      Authorization,
    },
  });

  if (!response.ok) {
    console.error(
      "Error fetching payments:",
      response.status,
      response.statusText
    );
    return null;
  }

  return response.json();
};

export const getAccountCapabilities = async (
  accountId?: string,
  useDev: boolean = false
): Promise<Capabilities | null> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}`);
  url.searchParams.set("include", "configuration.merchant");
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(url.toString(), {
    headers: {
      "Stripe-Version": version,
      Authorization,
    },
  });

  if (!response.ok) {
    console.error(
      "Error fetching capabilities:",
      response.status,
      response.statusText
    );
    return null;
  }

  const data = await response.json();
  return data.configuration?.merchant?.capabilities;
};
