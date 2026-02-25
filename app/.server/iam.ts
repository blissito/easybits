import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { db } from "./db";
import type { ApiKeyScope } from "@prisma/client";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): {
  raw: string;
  prefix: string;
  hashed: string;
} {
  const id = nanoid(32);
  const raw = `eb_sk_live_${id}`;
  const prefix = raw.slice(0, 19); // "eb_sk_live_" + 8 chars
  return { raw, prefix, hashed: hashKey(raw) };
}

export async function createApiKey(
  userId: string,
  opts: { name: string; scopes: ApiKeyScope[]; expiresAt?: Date }
) {
  const { raw, prefix, hashed } = generateApiKey();
  const key = await db.apiKey.create({
    data: {
      name: opts.name,
      hashedKey: hashed,
      prefix,
      scopes: opts.scopes,
      expiresAt: opts.expiresAt,
      userId,
    },
  });
  return { id: key.id, prefix, raw, scopes: key.scopes, name: key.name };
}

export async function validateApiKey(raw: string) {
  const hashed = hashKey(raw);
  const key = await db.apiKey.findUnique({ where: { hashedKey: hashed } });
  if (!key) return null;
  if (key.status !== "ACTIVE") return null;
  if (key.expiresAt && key.expiresAt < new Date()) {
    await db.apiKey.update({
      where: { id: key.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  return key;
}

export async function revokeApiKey(keyId: string, userId: string) {
  return db.apiKey.updateMany({
    where: { id: keyId, userId },
    data: { status: "REVOKED" },
  });
}

export async function listApiKeys(userId: string) {
  return db.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function hasScope(
  scopes: ApiKeyScope[],
  required: ApiKeyScope
): boolean {
  if (scopes.includes("ADMIN")) return true;
  return scopes.includes(required);
}
