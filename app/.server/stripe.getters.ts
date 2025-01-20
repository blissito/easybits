import { config } from "./config";
import { createUserSession } from "./getters";

const location = config.baseUrl;

// stripe login
export const getStripeURL = () => {
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.STRIPE_CLIENT_ID as string);
  url.searchParams.set("redirect_uri", location + "/login?auth=stripe");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read_write");
  return url.toString();
};

export const validateStripeAccessToken = async (code: string) => {
  const url = new URL("https://connect.stripe.com/oauth/token");
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("redirect_uri", location + "/login?auth=stripe");
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("client_secret", process.env.STRIPE_SECRET_KEY);

  const options: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  };
  return fetch(url.toString(), options)
    .then((r) => r.json())
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
  const { error_description, access_token } = await validateStripeAccessToken(
    code
  );
  if (error_description) throw new Error(error_description);
  if (!access_token) throw new Error("No access_token found in response");
  const stripeData = await getStripeExtraData(access_token);
  console.log("USED_STRIPE_DATA", stripeData);
  if (!stripeData.email) {
    // show signup screen
  } else {
    await createUserSession(
      { email: stripeData.email, stripe: stripeData },
      request
    );
  }
};
