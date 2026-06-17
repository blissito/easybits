import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "./db";
import type { User } from "@prisma/client";

const SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET is required in production");
      })()
    : "dev-secret");
const ISSUER = "https://www.easybits.cloud";
const AUDIENCE = "easybits-mcp";
const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1h

export const BASE_URL = process.env.BASE_URL || ISSUER;

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function base64UrlSha256(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  return base64UrlSha256(verifier) === challenge;
}

export function issueAccessToken(userId: string, scope = "mcp"): {
  token: string;
  expiresIn: number;
} {
  const token = jwt.sign(
    { sub: userId, scope, typ: "oauth" },
    SECRET,
    {
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    }
  );
  return { token, expiresIn: ACCESS_TOKEN_TTL_SEC };
}

const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 90; // 90d

/**
 * Issue an opaque refresh token. Only its sha256 hash is stored, so the DB
 * never holds the secret. Returned plaintext goes to the client once.
 */
export async function issueRefreshToken(
  userId: string,
  clientId: string,
  scope = "mcp"
): Promise<string> {
  const raw = randomToken(32);
  await db.oAuthRefreshToken.create({
    data: {
      tokenHash: sha256(raw),
      clientId,
      userId,
      scope,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  });
  return raw;
}

/**
 * Rotate a refresh token: verify it, revoke it, and mint a fresh access +
 * refresh pair. Returns null if invalid/expired/revoked. One-time-use rotation
 * limits the blast radius of a leaked refresh token.
 */
export async function rotateRefreshToken(
  raw: string,
  clientId: string
): Promise<{ access: string; refresh: string; expiresIn: number; scope: string } | null> {
  const row = await db.oAuthRefreshToken.findUnique({
    where: { tokenHash: sha256(raw) },
  });
  if (!row || row.revoked || row.clientId !== clientId || row.expiresAt < new Date()) {
    return null;
  }
  await db.oAuthRefreshToken.update({
    where: { id: row.id },
    data: { revoked: true },
  });
  const scope = row.scope || "mcp";
  const { token, expiresIn } = issueAccessToken(row.userId, scope);
  const refresh = await issueRefreshToken(row.userId, clientId, scope);
  return { access: token, refresh, expiresIn, scope };
}

/**
 * Attempt to verify a Bearer token as an OAuth-issued JWT.
 * Returns the associated User or null if the token is not a valid JWT.
 * Never throws — designed to silently fall through to API-key auth if the
 * token is not an OAuth JWT.
 */
export async function tryVerifyOAuthJwt(raw: string): Promise<User | null> {
  try {
    const payload = jwt.verify(raw, SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;
    if (payload.typ !== "oauth" || typeof payload.sub !== "string") return null;
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    return user ?? null;
  } catch {
    return null;
  }
}
