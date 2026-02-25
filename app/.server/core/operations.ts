import { db } from "../db";
import { nanoid } from "nanoid";
import {
  getClientForFile,
  resolveProvider,
  createStorageClient,
  getPlatformDefaultClient,
  copyObjectAcrossBuckets,
  deleteObjectFromBucket,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
} from "../storage";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import type { StorageRegion } from "@prisma/client";
import { fileEvents } from "./fileEvents";

// --- List Files ---

export async function listFiles(
  ctx: AuthContext,
  opts?: { assetId?: string; limit?: number; cursor?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 50, 100);

  const where: Record<string, unknown> = { ownerId: ctx.user.id, status: { not: "DELETED" } };
  if (opts?.assetId) {
    where.assetIds = { has: opts.assetId };
  }

  const files = await db.file.findMany({
    where,
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      storageKey: true,
      size: true,
      contentType: true,
      status: true,
      access: true,
      metadata: true,
      storageProviderId: true,
      createdAt: true,
    },
  });

  const hasMore = files.length > limit;
  const items = hasMore ? files.slice(0, limit) : files;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor };
}

// --- Get File ---

export async function getFile(ctx: AuthContext, fileId: string) {
  requireScope(ctx, "READ");

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || file.status === "DELETED") {
    throw new Error("File not found");
  }
  if (file.ownerId !== ctx.user.id) {
    // Check permissions
    const perm = await db.permission.findFirst({
      where: {
        granteeId: ctx.user.id,
        resourceType: "file",
        resourceId: file.id,
        canRead: true,
      },
    });
    if (!perm) {
      throw new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const client = await getClientForFile(file.storageProviderId, ctx.user.id);
  const readUrl = await client.getReadUrl(file.storageKey);

  return { ...file, readUrl };
}

// --- Upload File ---

export async function uploadFile(
  ctx: AuthContext,
  opts: {
    fileName: string;
    contentType: string;
    size: number;
    assetId?: string;
    access?: "public" | "private";
    region?: StorageRegion;
  }
) {
  requireScope(ctx, "WRITE");

  const provider = await resolveProvider(ctx.user.id, {
    access: opts.access,
    region: opts.region,
  });

  const storageKey = opts.assetId
    ? `${ctx.user.id}/${opts.assetId}/${nanoid(3)}`
    : `${ctx.user.id}/${nanoid(3)}`;
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();

  const putUrl = await client.getPutUrl(storageKey);

  const file = await db.file.create({
    data: {
      name: opts.fileName,
      storageKey,
      slug: storageKey,
      size: opts.size,
      contentType: opts.contentType,
      ownerId: ctx.user.id,
      access: opts.access || "private",
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      ...(opts.assetId ? { assetIds: [opts.assetId] } : {}),
    },
  });

  fileEvents.emit("file:changed", ctx.user.id);
  return { file, putUrl };
}

// --- Delete File ---

export async function deleteFile(ctx: AuthContext, fileId: string) {
  requireScope(ctx, "DELETE");

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error("File not found");
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Error("Forbidden");
  }

  await db.file.update({
    where: { id: fileId },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  fileEvents.emit("file:changed", ctx.user.id);
  return { success: true };
}

// --- Restore File ---

export async function restoreFile(ctx: AuthContext, fileId: string) {
  requireScope(ctx, "DELETE");

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error("File not found");
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Error("Forbidden");
  }
  if (file.status !== "DELETED") {
    throw new Error("File is not deleted");
  }

  await db.file.update({
    where: { id: fileId },
    data: { status: "DONE", deletedAt: null },
  });

  fileEvents.emit("file:changed", ctx.user.id);
  return { success: true };
}

// --- Purge Deleted Files (7+ days) ---

export async function purgeDeletedFiles() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const files = await db.file.findMany({
    where: { status: "DELETED", deletedAt: { lt: cutoff } },
  });

  for (const file of files) {
    try {
      const client = await getClientForFile(file.storageProviderId, file.ownerId);
      await client.deleteObject(file.storageKey);
    } catch {
      // storage already gone, continue with DB cleanup
    }
    await db.file.delete({ where: { id: file.id } });
  }

  return { purged: files.length };
}

// --- Share File ---

export async function shareFile(
  ctx: AuthContext,
  opts: { fileId: string; targetEmail: string; canRead?: boolean; canWrite?: boolean; canDelete?: boolean }
) {
  requireScope(ctx, "WRITE");

  const file = await db.file.findUnique({ where: { id: opts.fileId } });
  if (!file || file.ownerId !== ctx.user.id) {
    throw new Error("File not found or not owner");
  }

  const targetUser = await db.user.findUnique({
    where: { email: opts.targetEmail },
  });
  if (!targetUser) {
    throw new Error("Target user not found");
  }

  const permission = await db.permission.create({
    data: {
      granteeId: targetUser.id,
      grantedById: ctx.user.id,
      resourceType: "file",
      resourceId: file.id,
      canRead: opts.canRead ?? true,
      canWrite: opts.canWrite ?? false,
      canDelete: opts.canDelete ?? false,
    },
  });

  return permission;
}

// --- Update File ---

export async function updateFile(
  ctx: AuthContext,
  opts: {
    fileId: string;
    name?: string;
    access?: "public" | "private";
    metadata?: Record<string, unknown>;
  }
) {
  requireScope(ctx, "WRITE");

  const file = await db.file.findUnique({ where: { id: opts.fileId } });
  if (!file || file.ownerId !== ctx.user.id) {
    throw new Error("File not found or not owner");
  }
  if (file.status === "DELETED") {
    throw new Error("Cannot update a deleted file");
  }

  const updates: Record<string, unknown> = {};

  if (opts.name !== undefined) {
    updates.name = opts.name;
  }

  if (opts.metadata !== undefined) {
    const existing = (file.metadata as Record<string, unknown>) || {};
    updates.metadata = { ...existing, ...opts.metadata };
  }

  if (opts.access !== undefined && opts.access !== file.access) {
    if (file.storageProviderId !== null) {
      throw new Error("Access change is only supported for platform-stored files (no custom provider)");
    }

    const s3Key = `mcp/${file.storageKey}`;

    if (opts.access === "public") {
      await copyObjectAcrossBuckets({ fromBucket: PRIVATE_BUCKET, toBucket: PUBLIC_BUCKET, key: s3Key });
      await deleteObjectFromBucket({ bucket: PRIVATE_BUCKET, key: s3Key });
      updates.access = "public";
      updates.url = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/${s3Key}`;
    } else {
      await copyObjectAcrossBuckets({ fromBucket: PUBLIC_BUCKET, toBucket: PRIVATE_BUCKET, key: s3Key });
      await deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: s3Key });
      updates.access = "private";
      updates.url = "";
    }
  }

  if (Object.keys(updates).length === 0) {
    return file;
  }

  const updated = await db.file.update({
    where: { id: opts.fileId },
    data: updates,
  });

  fileEvents.emit("file:changed", ctx.user.id);
  return updated;
}

// --- Generate Share Token ---

export async function generateShareToken(
  ctx: AuthContext,
  opts: { fileId: string; expiresIn?: number; source: "ui" | "mcp" | "sdk" }
) {
  requireScope(ctx, "READ");

  const expiresIn = opts.expiresIn ?? 3600;
  const file = await db.file.findUnique({ where: { id: opts.fileId } });
  if (!file || file.status === "DELETED") {
    throw new Error("File not found");
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Error("Forbidden");
  }

  const client = await getClientForFile(file.storageProviderId, ctx.user.id);
  const url = await client.getReadUrl(file.storageKey, expiresIn);

  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const token = await db.shareToken.create({
    data: {
      fileId: opts.fileId,
      ownerId: ctx.user.id,
      source: opts.source,
      expiresAt,
      expiresIn,
    },
  });

  return { url, token: { id: token.id, fileId: token.fileId, source: token.source, expiresAt: token.expiresAt, createdAt: token.createdAt } };
}

// --- List Share Tokens ---

export async function listShareTokens(
  ctx: AuthContext,
  opts?: { fileId?: string; limit?: number; cursor?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 50, 100);

  const where: Record<string, unknown> = { ownerId: ctx.user.id };
  if (opts?.fileId) {
    where.fileId = opts.fileId;
  }

  const tokens = await db.shareToken.findMany({
    where,
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileId: true,
      source: true,
      expiresAt: true,
      expiresIn: true,
      createdAt: true,
      file: { select: { name: true } },
    },
  });

  const hasMore = tokens.length > limit;
  const items = (hasMore ? tokens.slice(0, limit) : tokens).map((t) => ({
    ...t,
    expired: t.expiresAt < new Date(),
  }));
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor };
}

// --- List Deleted Files ---

export async function listDeletedFiles(
  ctx: AuthContext,
  opts?: { limit?: number; cursor?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 50, 100);

  const files = await db.file.findMany({
    where: { ownerId: ctx.user.id, status: "DELETED" },
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      name: true,
      storageKey: true,
      size: true,
      contentType: true,
      status: true,
      access: true,
      metadata: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  const hasMore = files.length > limit;
  const items = (hasMore ? files.slice(0, limit) : files).map((f) => {
    const deletedAt = f.deletedAt ? new Date(f.deletedAt).getTime() : Date.now();
    const purgeAt = deletedAt + 7 * 24 * 60 * 60 * 1000;
    const daysUntilPurge = Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return { ...f, daysUntilPurge };
  });
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor };
}
