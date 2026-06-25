import { redirect } from "react-router";
import { db } from "./db";
import { commitSession, getSession } from "./sessions";
import type { Asset, User } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { createHost } from "~/lib/fly_certs/certs_getters";
import { sendWelcomeEmail } from "./emails/sendWelcome";
import { getServerDomain } from "./urlUtils";
import { canImpersonate } from "./delegation";

const throwRedirect = (request: Request) => {
  const url = new URL(request.url);
  return redirect("/login?next=" + url.pathname);
};

/**
 * Single choke-point for "current user". Resolves the EFFECTIVE user: the real
 * operator from `session.email`, unless impersonation (`actAsEmail`) is set AND
 * the operator is authorized — then the target account. Authorization is
 * re-verified here every request, so a forged/stale cookie can't impersonate.
 */
const resolveEffectiveUser = async (
  session: Awaited<ReturnType<typeof getSession>>
): Promise<User | null> => {
  const email = session.get("email");
  if (!email) return null;
  const real = await db.user.findUnique({ where: { email } });
  if (!real) return null;
  const actAs = session.get("actAsEmail");
  if (actAs && actAs !== real.email) {
    const target = await db.user.findUnique({ where: { email: actAs } });
    if (target && (await canImpersonate(real.id, target.id))) return target;
  }
  return real;
};

export const getUserOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  const user = await resolveEffectiveUser(session);
  if (!user) throw throwRedirect(request);
  return user;
};

export const getUserOrNull = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  return resolveEffectiveUser(session);
};

/** The REAL logged-in operator, never impersonated. For the switcher/banner/audit. */
export const getRealUserOrNull = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  const email = session.get("email");
  if (!email) return null;
  return db.user.findUnique({ where: { email } });
};

/** Superuser check: ADMIN_EMAILS env OR `Admin` role. Read env at call time (no module-level throw). */
export const isAdminUser = (
  user: Pick<User, "email" | "roles"> | null | undefined
): boolean => {
  if (!user) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return (
    adminEmails.includes((user.email || "").toLowerCase()) ||
    (user.roles || []).includes("Admin")
  );
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
  // create certificate - use server domain
  const domain = getServerDomain();
  await createHost(`${host}.${domain}`); // @revisit
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
      storageKey: true,
    },
  });

export type OrderItemInput = {
  kind: string; // "asset" | "credit_pack" | "subscription" | "custom"
  refId?: string; // assetId / packId / planKey — optional, open
  label: string;
  quantity?: number;
  unitPrice?: number;
};

export type CreateOrderInput = {
  customer_email: string;
  type?: string;
  items?: OrderItemInput[];
  assetId?: string;
  customerId?: string;
  merchantId?: string;
  price?: number | null;
  currency?: string | null;
  total?: string;
  status?: string;
  priceId?: string | null;
  productId?: string | null;
  note?: string | null;
};

/** Generic order — works with or without an associated model (asset/pack/plan). */
export const createOrder = (input: CreateOrderInput) =>
  db.order.create({ data: input });

/** Convenience for marketplace asset sales. */
export const createAssetOrder = ({
  customer,
  asset,
  status,
}: {
  status?: string;
  asset: Asset;
  customer: User; // @todo change confusing name
}) =>
  createOrder({
    type: "asset_sale",
    customer_email: customer.email,
    customerId: customer.id,
    assetId: asset.id,
    merchantId: asset.userId,
    price: asset.price,
    currency: asset.currency,
    total: `$ ${asset.price} ${asset.currency}`,
    priceId: asset.stripePrice,
    productId: asset.stripeProduct,
    note: asset.note, // @revisit
    status,
    items: [
      {
        kind: "asset",
        refId: asset.id,
        label: asset.title ?? "Asset",
        quantity: 1,
        unitPrice: asset.price ?? 0,
      },
    ],
  });

export const getUserSession = async (email: string, request: Request) => {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  session.set("email", email);
  return session;
};
