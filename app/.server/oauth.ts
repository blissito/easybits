import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "./db";
import type { User } from "@prisma/client";

const SECRET = process.env.JWT_SECRET || "dev-secret";
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
