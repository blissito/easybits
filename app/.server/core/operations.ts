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
    throw new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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

  if (opts.size <= 0 || opts.size > 5_368_709_120) {
    throw new Response(JSON.stringify({ error: "Invalid file size (must be 1 byte to 5GB)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fileCount = await db.file.count({
    where: { ownerId: ctx.user.id, status: { not: "DELETED" } },
  });
  if (fileCount >= 10_000) {
    throw new Response(JSON.stringify({ error: "File limit exceeded (max 10,000)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      status: "PENDING",
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
    throw new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
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
    throw new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.status !== "DELETED") {
    throw new Response(JSON.stringify({ error: "File is not deleted" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
    throw new Response(JSON.stringify({ error: "File not found or not owner" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetUser = await db.user.findUnique({
    where: { email: opts.targetEmail },
  });
  if (!targetUser) {
    throw new Response(JSON.stringify({ error: "Share operation failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const existing = await db.permission.findFirst({
    where: {
      granteeId: targetUser.id,
      resourceType: "file",
      resourceId: file.id,
    },
  });

  const permData = {
    canRead: opts.canRead ?? true,
    canWrite: opts.canWrite ?? false,
    canDelete: opts.canDelete ?? false,
  };

  const permission = existing
    ? await db.permission.update({ where: { id: existing.id }, data: permData })
    : await db.permission.create({
        data: {
          granteeId: targetUser.id,
          grantedById: ctx.user.id,
          resourceType: "file",
          resourceId: file.id,
          ...permData,
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
    status?: string;
  }
) {
  requireScope(ctx, "WRITE");

  const file = await db.file.findUnique({ where: { id: opts.fileId } });
  if (!file || file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "File not found or not owner" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.status === "DELETED") {
    throw new Response(JSON.stringify({ error: "Cannot update a deleted file" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: Record<string, unknown> = {};

  if (opts.name !== undefined) {
    updates.name = opts.name;
  }

  // Only allow PENDING → DONE transition
  if (opts.status === "DONE" && file.status === "PENDING") {
    updates.status = "DONE";
  }

  if (opts.metadata !== undefined) {
    const existing = (file.metadata as Record<string, unknown>) || {};
    const merged = { ...existing, ...opts.metadata };
    if (JSON.stringify(merged).length > 10_240) {
      throw new Response(JSON.stringify({ error: "Metadata too large (max 10KB)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    updates.metadata = merged;
  }

  if (opts.access !== undefined && opts.access !== file.access) {
    if (file.storageProviderId !== null) {
      throw new Response(JSON.stringify({ error: "Access change is only supported for platform-stored files (no custom provider)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    }

    const s3Key = `mcp/${file.storageKey}`;

    const fromBucket = opts.access === "public" ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const toBucket = opts.access === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;

    await copyObjectAcrossBuckets({ fromBucket, toBucket, key: s3Key });

    updates.access = opts.access;
    updates.url = opts.access === "public"
      ? `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/${s3Key}`
      : "";

    // Update DB first; if it fails, clean up the copy
    try {
      const updated = await db.file.update({
        where: { id: opts.fileId },
        data: updates,
      });
      // DB succeeded — safe to delete from source bucket
      await deleteObjectFromBucket({ bucket: fromBucket, key: s3Key }).catch(() => {});
      fileEvents.emit("file:changed", ctx.user.id);
      return updated;
    } catch (err) {
      // Rollback: delete the copy we just made
      await deleteObjectFromBucket({ bucket: toBucket, key: s3Key }).catch(() => {});
      throw err;
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

  const raw = opts.expiresIn ?? 3600;
  const expiresIn = Math.max(60, Math.min(raw, 604800));
  const file = await db.file.findUnique({ where: { id: opts.fileId } });
  if (!file || file.status === "DELETED") {
    throw new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
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

// --- Website Operations ---

import { slugify } from "../utils/slugify";

export async function listWebsites(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const websites = await db.website.findMany({
    where: { ownerId: ctx.user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return websites.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    fileCount: w.fileCount,
    totalSize: w.totalSize,
    createdAt: w.createdAt,
    url: `https://${w.slug}.easybits.cloud`,
  }));
}

export async function createWebsite(ctx: AuthContext, opts: { name: string }) {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim();
  if (!name) {
    throw new Response(JSON.stringify({ error: "Name required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const baseSlug = slugify(name);

  let website;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${nanoid(6)}`;
    try {
      website = await db.website.create({
        data: { name, slug, ownerId: ctx.user.id, prefix: "" },
      });
      break;
    } catch (err: unknown) {
      // Unique constraint violation — retry with different slug
      const isPrismaUnique =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (!isPrismaUnique || attempt === 2) throw err;
    }
  }

  if (!website) throw new Error("Failed to create website");

  const updated = await db.website.update({
    where: { id: website.id },
    data: { prefix: `sites/${website.id}/` },
  });

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    prefix: updated.prefix,
    url: `https://${updated.slug}.easybits.cloud`,
  };
}

export async function getWebsite(ctx: AuthContext, websiteId: string) {
  requireScope(ctx, "READ");
  const website = await db.website.findUnique({ where: { id: websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return {
    id: website.id,
    name: website.name,
    slug: website.slug,
    status: website.status,
    fileCount: website.fileCount,
    totalSize: website.totalSize,
    prefix: website.prefix,
    createdAt: website.createdAt,
    url: `https://${website.slug}.easybits.cloud`,
  };
}

export async function updateWebsite(
  ctx: AuthContext,
  websiteId: string,
  opts: { name?: string; status?: string }
) {
  requireScope(ctx, "WRITE");
  const website = await db.website.findUnique({ where: { id: websiteId } });
  if (!website || website.ownerId !== ctx.user.id || website.deletedAt) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.status !== undefined) updates.status = opts.status;

  // Compute authoritative stats from DB
  const stats = await db.file.aggregate({
    where: {
      name: { startsWith: website.prefix },
      ownerId: ctx.user.id,
      status: "DONE",
    },
    _count: true,
    _sum: { size: true },
  });
  updates.fileCount = stats._count;
  updates.totalSize = stats._sum.size ?? 0;

  const updated = await db.website.update({
    where: { id: websiteId },
    data: updates,
  });
  return updated;
}

export async function deleteWebsite(ctx: AuthContext, websiteId: string) {
  requireScope(ctx, "DELETE");
  const website = await db.website.findUnique({ where: { id: websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.file.updateMany({
    where: {
      ownerId: ctx.user.id,
      name: { startsWith: website.prefix },
      status: { not: "DELETED" },
    },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  await db.website.update({
    where: { id: websiteId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
  return { ok: true };
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
