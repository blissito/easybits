import type { AiProvider } from "@prisma/client";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return "****" + key.slice(-4);
}

export async function setAiKey(
  ctx: AuthContext,
  provider: AiProvider,
  keyValue: string
) {
  const record = await db.userAiKey.upsert({
    where: { userId_provider: { userId: ctx.user.id, provider } },
    create: { userId: ctx.user.id, provider, keyValue },
    update: { keyValue },
  });
  return { id: record.id, provider: record.provider, maskedKey: maskKey(record.keyValue) };
}

export async function listAiKeys(ctx: AuthContext) {
  const keys = await db.userAiKey.findMany({
    where: { userId: ctx.user.id },
    select: { id: true, provider: true, keyValue: true, createdAt: true, updatedAt: true },
  });
  return keys.map((k) => ({
    id: k.id,
    provider: k.provider,
    maskedKey: maskKey(k.keyValue),
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));
}

export async function deleteAiKey(ctx: AuthContext, provider: AiProvider) {
  await db.userAiKey.delete({
    where: { userId_provider: { userId: ctx.user.id, provider } },
  });
  return { deleted: true, provider };
}

export async function resolveAiKey(
  userId: string,
  provider: AiProvider
): Promise<string | null> {
  const record = await db.userAiKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  return record?.keyValue ?? null;
}
