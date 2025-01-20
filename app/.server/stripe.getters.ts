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

const getStripeExtraData = (access_token: string) => {
  const url = new URL(`https://api.stripe.com/v1/account`);
  const options: RequestInit = {
    headers: { Authorization: `Bearer ${access_token}` },
  };
  return fetch(url.toString(), options)
    .then((r) => r.json())
    .catch((e) => console.error(e));
};

export const createStripeSession = async (code: string, request: Request) => {
  const { error_description, access_token } = await validateStripeAccessToken(
    code
  );
  if (error_description) throw new Error(error_description);
  if (!access_token) throw new Error("No access_token found in response");
  const userData = await getStripeExtraData(access_token);

  if (!userData.email) throw new Error("Wrong stripe user data");
  // we need to format the user from stripe to our schema
  await createUserSession({ email: userData.email, id: undefined }, request);
};
