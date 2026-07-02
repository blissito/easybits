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
  opts: {
    name: string;
    scopes: ApiKeyScope[];
    expiresAt?: Date;
    /**
     * Bind this key to a single workspace. A workspace-scoped key can only
     * read/write files of that workspace (enforced in apiAuth + operations).
     */
    workspaceId?: string;
  }
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
      workspaceId: opts.workspaceId ?? null,
    },
  });
  return {
    id: key.id,
    prefix,
    raw,
    scopes: key.scopes,
    name: key.name,
    workspaceId: key.workspaceId,
  };
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
    data: { status: "REVOKED", revokedAt: new Date() },
  });
}

// Permanently delete API keys revoked more than 7 days ago.
// Legacy keys revoked before `revokedAt` existed have it null — fall back to
// `updatedAt`, which was stamped when the key's status flipped to REVOKED.
export async function purgeRevokedApiKeys() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db.apiKey.deleteMany({
    where: {
      status: "REVOKED",
      OR: [
        { revokedAt: { lt: cutoff } },
        { revokedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
  });
  return { purged: result.count };
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
