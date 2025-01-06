import { redirect } from "react-router";
import { db } from "./db";
import { commitSession, getSession } from "./sessions";
import type { User } from "@prisma/client";

const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.app";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

export const getUserOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.has("email")) throw redirect("/login");
  const user = await db.user.findUnique({
    where: { email: session.get("email") },
  });
  if (!user) throw redirect("/login");
  return user;
};

export const getUserOrNull = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.has("email")) return null;
  const user = await db.user.findUnique({
    where: { email: session.get("email") },
  });
  if (!user) return null;
  return user;
};

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
  url.searchParams.set("redirect_uri", location + "/login");
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
  url.searchParams.set("redirect_uri", location + "/login");
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/userinfo.email"
  );
  return url.toString();
};

const createUserSession = async (
  userData: {
    email: string;
    verified_email: boolean;
    picture: string;
  },
  request: Request
) => {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  await db.user.upsert({
    where: { email: userData.email },
    create: userData,
    update: userData,
  });
  session.set("email", userData.email);
  throw redirect("/", {
    // @todo: redirect to dash
    headers: {
      "set-cookie": await commitSession(session),
    },
  });
};

// export to use in loader
export const createGoogleSession = async (code: string, request: Request) => {
  const { error, access_token } = await validateGoogleAccessToken(code);
  if (error) throw new Error("wrong google code");
  if (!access_token) throw new Error("No access_token found in response");
  const userData = await getGoogleExtraData(access_token);
  if (!userData.email) throw new Error("Wrong google user data");
  await createUserSession({ ...userData, id: undefined }, request);
};

export const validateUserToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, process.env.SECRET as string);
    return {
      isValid: true,
      decoded,
    };
  } catch (e: unknown) {
    console.error(e);
    return {
      isValid: false,
      err: e,
      errorMessage: (e as Error).message,
    };
  }
};

// KEYS stuff
export const createUserKeys = async (user: Partial<User>) => {
  const secretKey = jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET as string
  );
  const publicKey = randomUUID();
  return await db.user.update({
    where: { email: user.email },
    data: {
      keys: {
        public: publicKey,
        secret: secretKey,
      },
    },
  });
};
// example: expiresIn: '1h'
