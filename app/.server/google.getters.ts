import { createUserSession } from "./getters";
import { config } from "./config";
import type { User } from "@prisma/client";

const location = config.baseUrl;

// google login
type ValidCodeResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
  error?: unknown;
};
// step2
const validateGoogleAccessToken = async (
  code: string
): Promise<ValidCodeResponse> => {
  const url = new URL("https://oauth2.googleapis.com/token");
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("redirect_uri", location + "/login?auth=google");
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/userinfo.email"
  );
  const options: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${btoa(
        process.env.GOOGLE_CLIENT_ID + ":" + process.env.GOOGLE_SECRET
      )}`,
    },
  };
  return fetch(url.toString(), options)
    .then((r) => r.json())
    .catch((e) => console.error(e));
};

type GoogleExtraData = {
  id: string;
  email: string;
  verified_email: boolean;
  picture: string;
};
// step 3 @todo: displayName?
const getGoogleExtraData = (access_token: string): Promise<GoogleExtraData> => {
  const url = new URL("https://www.googleapis.com/oauth2/v2/userinfo");
  const options: RequestInit = {
    headers: { Authorization: `Bearer ${access_token}` },
  };
  return fetch(url.toString(), options)
    .then((r) => r.json())
    .catch((e) => console.error(e));
};

// step 1
export const getGoogleURL = () => {
  const url = new URL("https://accounts.google.com/o/oauth2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID as string);
  url.searchParams.set("redirect_uri", location + "/login?auth=google");
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/userinfo.email"
  );
  return url.toString();
};

// export to use in loader
export const createGoogleSession = async (
  code: string,
  request: Request,
  cb?: (user: User) => void,
  config?: { redirectURL: string }
) => {
  const { redirectURL } = config || {};
  const { error, access_token, refresh_token } =
    await validateGoogleAccessToken(code);
  if (error) {
    console.error("::CODE_ERROR::", error);
    throw new Error("wrong google code", error);
  }
  if (!access_token) throw new Error("No access_token found in response");
  const userData = await getGoogleExtraData(access_token);
  if (!userData.email) throw new Error("Wrong google user data");
  const url = new URL(request.url);
  // const redirectURL = url.searchParams.get("redirect") as string;
  await createUserSession(
    { ...userData, id: undefined, redirectURL: redirectURL || undefined },
    request,
    cb
  );
};
