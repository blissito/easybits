import { redirect } from "react-router";
import { db } from "./db";
import { commitSession, getSession } from "./sessions";
import type { User } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { createHost } from "~/lib/fly_certs/certs_getters";
import { sendWelcomeEmail } from "./emails/sendWelcome";

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

export const setSessionCookie = async ({
  email,
  redirectURL = "/dash",
  request,
}: {
  email: string;
  redirectURL?: string;
  request: Request;
}) => {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  session.set("email", email);
  throw redirect(redirectURL, {
    headers: {
      "set-cookie": await commitSession(session),
    },
  });
};

export const createUserSession = async (
  userData: {
    email: string;
    verified_email: boolean;
    picture: string;
    redirectURL?: string;
    displayName?: string;
  },
  request: Request,
  cb?: (user: User) => void
) => {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  const host = userData.email.split("@")[0];
  const user = await db.user.upsert({
    where: { email: userData.email.toLocaleLowerCase() },
    create: {
      email: userData.email,
      verified_email: userData.verified_email,
      picture: userData.picture,
      publicKey: randomUUID(), // @revisit
      host,
      displayName: userData.displayName,
    },
    update: {
      email: userData.email,
      verified_email: userData.verified_email,
      picture: userData.picture,
    },
  });

  //si el usuario es nuevo, manda el correo de bienvenida
  const date = Date.now();
  const mins = new Date(user.createdAt).getTime();
  const min3 = date - 180000 <= mins;
  if (min3) {
    sendWelcomeEmail(user.email, user.displayName!);
  }

  session.set("email", userData.email);
  // create certificate
  await createHost(`${host}.easybits.cloud`); // @revisit
  // @todo revisit!
  await cb?.(user);
  throw redirect(userData.redirectURL || "/dash", {
    // @todo revisit
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

export const getFilesForAssetId = (assetId: string) =>
  db.file.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      assetIds: {
        has: assetId,
      },
    },
    select: {
      name: true,
      id: true,
      size: true,
    },
  });
