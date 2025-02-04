import { redirect } from "react-router";
import { db } from "./db";
import { commitSession, getSession } from "./sessions";
import type { User } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { createHost } from "~/lib/fly_certs/certs_getters";

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

export const createUserSession = async (
  userData: {
    email: string;
    verified_email: boolean;
    picture: string;
  },
  request: Request
) => {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  const host = userData.email.split("@")[0];
  await db.user.upsert({
    where: { email: userData.email },
    create: { ...userData, publicKey: randomUUID(), host },
    update: userData,
  });
  session.set("email", userData.email);
  // create certificate
  await createHost(`${host}.easybits.cloud`);
  throw redirect("/dash", {
    // @todo: redirect to dash
    headers: {
      "set-cookie": await commitSession(session),
    },
  });
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
  const publicKey = randomUUID();
  const host = user.email?.split("@")[0] as string;
  await createHost(host);
  return await db.user.update({
    where: { email: user.email },
    data: {
      publicKey,
      host,
    },
  });
};
// example: expiresIn: '1h'
