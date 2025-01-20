import { redirect } from "react-router";
import { db } from "./db";
import { commitSession, getSession } from "./sessions";
import type { User } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { config } from "./config";

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
  await db.user.upsert({
    where: { email: userData.email },
    create: { ...userData, publicKey: randomUUID() },
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
  // const secretKey = jwt.sign(
  //   { email: user.email },
  //   process.env.JWT_SECRET as string
  // );
  const publicKey = randomUUID();
  return await db.user.update({
    where: { email: user.email },
    data: {
      publicKey,
    },
  });
};
// example: expiresIn: '1h'
