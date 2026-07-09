import { db } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";

const NAME_REGEX = /^[A-Z_][A-Z0-9_]*$/;

export interface SecretSummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listSecrets(userId: string): Promise<SecretSummary[]> {
  const rows = await db.secret.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  return rows;
}

export async function createSecret(
  userId: string,
  params: { name: string; value: string }
): Promise<SecretSummary> {
  const name = params.name.trim();
  if (!NAME_REGEX.test(name)) {
    throw new Error(
      "Secret name must match [A-Z_][A-Z0-9_]* (e.g. BRIGHTDATA_API_TOKEN)"
    );
  }
  if (!params.value || params.value.length === 0) {
    throw new Error("Secret value cannot be empty");
  }
  const encrypted = encryptSecret(params.value);
  const row = await db.secret.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, value: encrypted },
    update: { value: encrypted, lastUsedAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  return row;
}

export async function deleteSecret(
  userId: string,
  secretId: string
): Promise<{ deleted: boolean }> {
  const result = await db.secret.deleteMany({
    where: { id: secretId, userId },
  });
  return { deleted: result.count > 0 };
}

export async function deleteSecretByName(
  userId: string,
  name: string
): Promise<{ deleted: boolean }> {
  const result = await db.secret.deleteMany({
    where: { userId, name: name.trim() },
  });
  return { deleted: result.count > 0 };
}

/**
 * Server-side only — used by `agent_run` to inject secrets as env vars in
 * the sandbox. NEVER expose this to a route loader/action; the plaintext
 * must not leave the server boundary.
 */
// Decrypt and return a secret's plaintext WITHOUT bumping lastUsedAt. For the
// vault UI's copy-to-clipboard — the owner reading their own value is not an
// "agent used it" event, so it must not pollute the Último uso column.
export async function revealSecretValue(
  userId: string,
  secretId: string
): Promise<string | null> {
  const row = await db.secret.findFirst({
    where: { id: secretId, userId },
    select: { value: true },
  });
  if (!row) return null;
  return decryptSecret(row.value);
}

export async function getSecretValue(
  userId: string,
  name: string
): Promise<string | null> {
  const row = await db.secret.findUnique({
    where: { userId_name: { userId, name } },
    select: { id: true, value: true },
  });
  if (!row) return null;
  // Fire-and-forget bump of lastUsedAt; don't block the caller on it.
  db.secret
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return decryptSecret(row.value);
}
