import type { User } from "@prisma/client";
import { config } from "./config";
import { createUserSession } from "./getters";
import { db } from "./db";
import { getSession } from "./sessions";
import { findOrCreateStripeAccountV2, getStripeAccount } from "./stripe_v2";

const location = config.baseUrl;

// stripe login
export const getStripeURL = () => {
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.STRIPE_CLIENT_ID as string);
  url.searchParams.set("redirect_uri", location + "/login/success");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read_write");
  return url.toString();
};

export const validateStripeAccessToken = async (code: string) => {
  const url = new URL("https://connect.stripe.com/oauth/token");
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("redirect_uri", location + "/login/success");
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("client_secret", process.env.STRIPE_SECRET_KEY!);

  const options: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  };
  return fetch(url.toString(), options)
    .then((r) => r.json())
    .then((d) => {
      console.log("RECEIVED????", d);
      return d;
    })
    .catch((e) => console.error(e));
};

export type StripeType = {
  email?: string;
  id: string;
  stripeId?: string;
  country: string;
  default_currency: string;
  dashboard: {
    display_name: string;
    timezone: string;
  };
  settings: {
    branding: {
      icon: string;
      logo: string;
      primary_color: string;
      secondary_color: string;
    };
  };
};
const getStripeExtraData = async (access_token: string) => {
  const url = new URL(`https://api.stripe.com/v1/account`);
  const options: RequestInit = {
    headers: { Authorization: `Bearer ${access_token}` },
  };
  const data: StripeType = await fetch(url.toString(), options).then((r) =>
    r.json()
  );
  return {
    email: data.email,
    id: data.id,
    stripeId: data.id,
    country: data.country,
    default_currency: data.default_currency,
    settings: { branding: data.settings.branding },
    dashboard: data.dashboard,
  } satisfies StripeType;
};

export const createStripeSession = async (code: string, request: Request) => {
  const validated = await validateStripeAccessToken(code);
  const { error_description, access_token, stripe_user_id } = validated;
  if (error_description) throw new Error(error_description);
  if (!access_token) throw new Error("No access_token found in response");
  const { email } = await getStripeExtraData(access_token); // @revisit deprecated?
  if (!email) return null;

  // create or retrieve account v2
  const acc = await findOrCreateStripeAccountV2(email); // including User

  const session = await getSession(request.headers.get("Cookie"));
  session.set("email", acc.contact_email);
  return session;
};
