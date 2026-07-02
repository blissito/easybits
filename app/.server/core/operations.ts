import { db } from "../db";
import { nanoid } from "nanoid";
import {
  getClientForFile,
  getReadClientForPlatformFile,
  resolveProvider,
  createStorageClient,
  getPlatformDefaultClient,
  getPlatformPublicClient,
  buildPublicAssetUrl,
  copyObjectAcrossBuckets,
  deleteObjectFromBucket,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
} from "../storage";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import type { StorageRegion } from "@prisma/client";
import { createHost } from "~/lib/fly_certs/certs_getters";
import { fileEvents } from "./fileEvents";
import { PLANS, NEXT_PLAN, getUserPlan, formatPrice, type PlanKey } from "~/lib/plans";
import { dispatchWebhooks } from "../webhooks";
import { notifyFilesPurged } from "./notificationOperations";
import { checkAiGenerationLimit } from "../aiGenerationLimit";
import { requireWorkspace } from "../apiAuth";
import { createApiKey } from "../iam";

// --- Workspace helpers ---

/** Load a workspace owned by the caller (404 if missing / not owned / deleted). */
async function loadOwnedWorkspace(ctx: AuthContext, workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws || ws.ownerId !== ctx.user.id || ws.deletedAt || ws.status === "DELETED") {
    throw new Response(JSON.stringify({ error: "Workspace not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return ws;
}

/** Adjust a workspace's denormalized usage counters (never below zero). */
async function bumpWorkspaceUsage(workspaceId: string, deltaBytes: number, deltaCount: number) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { usedBytes: true, fileCount: true },
  });
  if (!ws) return;
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      usedBytes: Math.max(0, ws.usedBytes + deltaBytes),
      fileCount: Math.max(0, ws.fileCount + deltaCount),
    },
  });
}

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
  // A workspace-scoped key only ever lists its own workspace's files.
  if (ctx.workspaceId) where.workspaceId = ctx.workspaceId;

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

  return { items, nextCursor, hasMore };
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
  // A workspace-scoped key can only read files inside its workspace (404 else).
  requireWorkspace(ctx, file.workspaceId);
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

  const client = file.storageProviderId
    ? await getClientForFile(file.storageProviderId, ctx.user.id)
    : getReadClientForPlatformFile(file);
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
    source?: string;
    /** Upload into this workspace (namespaced storage + per-ws quota). */
    workspaceId?: string;
  }
) {
  requireScope(ctx, "WRITE");

  // Effective workspace: a workspace-scoped key forces its own workspace; an
  // account key may target one explicitly via opts. `requireWorkspace` guards
  // against a scoped key trying to write to a different workspace via opts.
  const workspaceId = ctx.workspaceId ?? opts.workspaceId ?? null;
  requireWorkspace(ctx, workspaceId);
  const workspace = workspaceId ? await loadOwnedWorkspace(ctx, workspaceId) : null;

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

  // Storage quota check
  const planKey = getUserPlan(ctx.user);
  const maxBytes = PLANS[planKey].storageGB * 1024 * 1024 * 1024;
  const usage = await db.file.aggregate({
    where: { ownerId: ctx.user.id, status: { not: "DELETED" } },
    _sum: { size: true },
  });
  const currentUsage = usage._sum.size ?? 0;
  if (currentUsage + opts.size > maxBytes) {
    throw new Response(
      JSON.stringify({ error: `Storage quota exceeded (${PLANS[planKey].storageGB}GB on ${planKey}). Upgrade at https://www.easybits.cloud/planes` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Per-workspace quota (in addition to the account plan ceiling above).
  if (workspace && workspace.quotaBytes != null && workspace.usedBytes + opts.size > workspace.quotaBytes) {
    throw new Response(
      JSON.stringify({ error: `Workspace quota exceeded (${Math.round(workspace.quotaBytes / 1048576)}MB).` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const provider = await resolveProvider(ctx.user.id, {
    access: opts.access,
    region: opts.region,
  });

  // Workspace files are namespaced under `ws/{workspaceId}/…` (mirrors the
  // `sites/{websiteId}/` convention) so a workspace is a real folder in storage.
  const baseKey = opts.assetId
    ? `${ctx.user.id}/${opts.assetId}/${nanoid(3)}`
    : `${ctx.user.id}/${nanoid(3)}`;
  const storageKey = workspaceId ? `ws/${workspaceId}/${baseKey}` : baseKey;

  // Public platform uploads must land in PUBLIC_BUCKET at root prefix —
  // the `mcp/` prefix is unreadable by the public bucket policy and would
  // 403 when embedded. Custom providers handle their own ACL.
  const isPublicPlatform = !provider && opts.access === "public";
  const client = provider
    ? createStorageClient(provider)
    : isPublicPlatform
      ? getPlatformPublicClient()
      : getPlatformDefaultClient();

  const putUrl = await client.getPutUrl(storageKey);
  const url = isPublicPlatform ? buildPublicAssetUrl(storageKey) : "";

  const file = await db.file.create({
    data: {
      name: opts.fileName,
      storageKey,
      slug: storageKey,
      size: opts.size,
      contentType: opts.contentType,
      ownerId: ctx.user.id,
      access: opts.access || "private",
      url,
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      ...(workspaceId ? { workspaceId } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.assetId ? { assetIds: [opts.assetId] } : {}),
    },
  });

  if (workspaceId) await bumpWorkspaceUsage(workspaceId, opts.size, 1);

  fileEvents.emit("file:changed", ctx.user.id);
  dispatchWebhooks(ctx.user.id, "file.created", { id: file.id, name: file.name, size: file.size, contentType: file.contentType, access: file.access });
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
  requireWorkspace(ctx, file.workspaceId);

  // If the file is publicly served, cut the public exposure NOW (move to the
  // private bucket + purge the Tigris edge) instead of waiting for the 7-day
  // purge / cache TTL. The record stays soft-deleted (recoverable as private).
  await depublishPublicObject(file);

  await db.file.update({
    where: { id: fileId },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  if (file.workspaceId) await bumpWorkspaceUsage(file.workspaceId, -file.size, -1);

  fileEvents.emit("file:changed", ctx.user.id);
  dispatchWebhooks(ctx.user.id, "file.deleted", { id: file.id, name: file.name });
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
  requireWorkspace(ctx, file.workspaceId);

  await db.file.update({
    where: { id: fileId },
    data: { status: "DONE", deletedAt: null },
  });

  if (file.workspaceId) await bumpWorkspaceUsage(file.workspaceId, file.size, 1);

  fileEvents.emit("file:changed", ctx.user.id);
  dispatchWebhooks(ctx.user.id, "file.restored", { id: file.id, name: file.name });
  return { success: true };
}

// --- Purge Deleted Files (7+ days) ---

/**
 * Permanently delete a File leaving ZERO residue — the single source of truth
 * for hard-deleting a file. Removes the storage object AND every DB row / loose
 * pointer that referenced it, in an order that satisfies Prisma's (Mongo-emulated)
 * referential integrity.
 *
 * Why this exists: `ShareToken.file` is a REQUIRED relation, so a bare
 * `db.file.delete` throws P2014 while any token still points at the file — that
 * used to 500 the purge cron and leave every later file stuck at "PURGE IN: 0 days".
 * The other references (Permission, VideoGeneration, PresentationStyle,
 * McpStructuredDoc, Character) are loose ObjectId pointers that don't block the
 * delete but would dangle forever — we null/pull them so nothing is left behind.
 *
 * NOTE (documented follow-up): HLS files also store `chunks/{storageKey}/` in the
 * `video-converter-hono` bucket; deleting that folder needs an S3 list primitive
 * we don't have yet, so those segments are not purged here.
 */
async function hardDeleteFile(file: {
  id: string;
  ownerId: string;
  storageKey: string;
  storageProviderId: string | null;
  access: string;
  url: string;
}) {
  // 1) Storage: the primary object. Best-effort — if it's already gone we still
  //    proceed with DB cleanup.
  try {
    if (!file.storageProviderId && file.access === "public") {
      // Public platform object lives in PUBLIC_BUCKET at root. Delete it via the
      // gateway-aware helper so the Tigris edge cache is purged too.
      const isLegacyMcpUrl = !!file.url && file.url.includes("/mcp/");
      await deleteObjectFromBucket({
        bucket: PUBLIC_BUCKET,
        key: isLegacyMcpUrl ? `mcp/${file.storageKey}` : file.storageKey,
      });
    } else {
      const client = file.storageProviderId
        ? await getClientForFile(file.storageProviderId, file.ownerId)
        : getReadClientForPlatformFile(file as any);
      await client.deleteObject(file.storageKey);
    }
  } catch {
    // storage already gone, continue with DB cleanup
  }

  // 2) DB dependents + dangling pointers, all scoped to this file id.
  await db.shareToken.deleteMany({ where: { fileId: file.id } }); // required relation (P2014)
  await db.permission.deleteMany({ where: { resourceType: "file", resourceId: file.id } });
  await db.videoGeneration.updateMany({ where: { stillFileId: file.id }, data: { stillFileId: null } });
  await db.videoGeneration.updateMany({ where: { videoFileId: file.id }, data: { videoFileId: null } });
  await db.presentationStyle.updateMany({ where: { sourceFileId: file.id }, data: { sourceFileId: null } });
  await db.mcpStructuredDoc.updateMany({ where: { lastPdfFileId: file.id }, data: { lastPdfFileId: null } });
  // Character.referenceFileIds is a String[] scalar list — Mongo/Prisma has no
  // element "pull", so load the (rare) rows holding this id and rewrite the array.
  const chars = await db.character.findMany({
    where: { referenceFileIds: { has: file.id } },
    select: { id: true, referenceFileIds: true },
  });
  for (const c of chars) {
    await db.character.update({
      where: { id: c.id },
      data: { referenceFileIds: c.referenceFileIds.filter((x) => x !== file.id) },
    });
  }

  // 3) The file row itself.
  await db.file.delete({ where: { id: file.id } });
}

export async function purgeDeletedFiles() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const files = await db.file.findMany({
    where: { status: "DELETED", deletedAt: { lt: cutoff } },
  });

  // Group successfully purged file names by owner so we send ONE notification per
  // owner per run (anti-spam), not one per file.
  const purgedByOwner = new Map<string, string[]>();
  for (const file of files) {
    try {
      await hardDeleteFile(file);
      const arr = purgedByOwner.get(file.ownerId) ?? [];
      arr.push(file.name);
      purgedByOwner.set(file.ownerId, arr);
    } catch (e) {
      // One bad row can't abort the whole batch.
      console.error(`purgeDeletedFiles: failed to delete file ${file.id}:`, e);
    }
  }

  // Notify each owner that their trash was permanently emptied. Best-effort:
  // a notification failure must never fail the purge.
  for (const [ownerId, names] of purgedByOwner) {
    try {
      await notifyFilesPurged(ownerId, names);
    } catch (e) {
      console.error(`purgeDeletedFiles: notify ${ownerId} failed:`, e);
    }
  }

  const purged = [...purgedByOwner.values()].reduce((n, a) => n + a.length, 0);
  return { purged, eligible: files.length };
}

/**
 * Stop serving a PUBLIC platform object immediately: move its bytes to the
 * private bucket and purge the public copy (origin + Tigris edge). Keeps the
 * file recoverable (it comes back as `private`) while ensuring a deleted public
 * URL stops returning 200 NOW instead of at the 7-day purge / cache TTL.
 * No-op for private files and custom-provider files.
 */
async function depublishPublicObject(file: {
  id: string;
  storageKey: string;
  url: string | null;
  access: string | null;
  storageProviderId: string | null;
}): Promise<void> {
  if (file.storageProviderId || file.access !== "public") return;
  const isLegacyMcpUrl = !!file.url && file.url.includes("/mcp/");
  const srcKey = isLegacyMcpUrl ? `mcp/${file.storageKey}` : file.storageKey;
  const dstKey = `mcp/${file.storageKey}`;
  try {
    await copyObjectAcrossBuckets({
      fromBucket: PUBLIC_BUCKET,
      toBucket: PRIVATE_BUCKET,
      key: srcKey,
      destKey: dstKey,
    });
  } catch {
    // source object may already be gone — still flip the record + purge edge
  }
  await deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: srcKey }).catch(() => {});
  await db.file.update({
    where: { id: file.id },
    data: { access: "private", url: "" },
  });
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

    // Public files live at the bucket root (browser-readable). Private files
    // live under the `mcp/` namespace. Source key depends on where the file
    // currently lives — derived from its url for already-public files.
    const isLegacyMcpUrl = !!file.url && file.url.includes("/mcp/");
    const srcKey = file.access === "public" && !isLegacyMcpUrl
      ? file.storageKey
      : `mcp/${file.storageKey}`;
    const dstKey = opts.access === "public" ? file.storageKey : `mcp/${file.storageKey}`;

    const fromBucket = file.access === "private" ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const toBucket = opts.access === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;

    await copyObjectAcrossBuckets({ fromBucket, toBucket, key: srcKey, destKey: dstKey });

    updates.access = opts.access;
    updates.url = opts.access === "public" ? buildPublicAssetUrl(dstKey) : "";

    // Update DB first; if it fails, clean up the copy
    try {
      const updated = await db.file.update({
        where: { id: opts.fileId },
        data: updates,
      });
      // DB succeeded — safe to delete from source bucket
      await deleteObjectFromBucket({ bucket: fromBucket, key: srcKey }).catch(() => {});
      fileEvents.emit("file:changed", ctx.user.id);
      dispatchWebhooks(ctx.user.id, "file.updated", { id: updated.id, name: updated.name, access: updated.access });
      return updated;
    } catch (err) {
      // Rollback: delete the copy we just made
      await deleteObjectFromBucket({ bucket: toBucket, key: dstKey }).catch(() => {});
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
  dispatchWebhooks(ctx.user.id, "file.updated", { id: updated.id, name: updated.name });
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

  const client = file.storageProviderId
    ? await getClientForFile(file.storageProviderId, ctx.user.id)
    : getReadClientForPlatformFile(file);
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

  return { items, nextCursor, hasMore };
}

// --- Website Operations ---

// Participios pasados (past participles as adjectives)
const PARTICIPLES_PAST = [
  "abrumado", "encendido", "perdido", "dormido", "callado", "hundido",
  "grabado", "torcido", "velado", "fundido", "tejido", "tallado",
  "forjado", "labrado", "templado", "pulido", "trazado", "marcado",
  "cerrado", "bordado", "pintado", "sellado", "curado", "cifrado",
];

// Participios presentes / gerundivos (present participles as adjectives)
const PARTICIPLES_PRESENT = [
  "durmiente", "creciente", "brillante", "ardiente", "naciente", "errante",
  "flotante", "vibrante", "latente", "rugiente", "silente", "distante",
  "reinante", "cortante", "radiante", "sonriente", "crujiente", "palpitante",
  "resonante", "cambiante", "danzante", "centelleante", "susurrante", "fulgurante",
];

const NOUNS = [
  "rio", "sol", "luna", "monte", "lago", "cielo", "bosque", "piedra",
  "fuego", "viento", "ola", "rayo", "nube", "flor", "arbol", "campo",
  "torre", "puente", "isla", "cumbre", "estrella", "aurora", "cristal",
  "oceano", "volcan", "selva", "costa", "pradera", "colina", "cascada",
];

function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function listWebsites(
  ctx: AuthContext,
  opts?: { limit?: number; offset?: number; search?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = opts?.offset ?? 0;

  const where: any = {
    ownerId: ctx.user.id,
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  };
  if (opts?.search) {
    where.name = { contains: opts.search, mode: "insensitive" };
  }

  const [websites, total] = await Promise.all([
    db.website.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.website.count({ where }),
  ]);

  return {
    total,
    items: websites.map((w) => {
      const subdomainUrl = w.subdomainEnabled
        ? `https://${w.slug}.easybits.cloud`
        : null;
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        status: w.status,
        fileCount: w.fileCount,
        totalSize: w.totalSize,
        createdAt: w.createdAt,
        url: subdomainUrl ?? `https://www.easybits.cloud/s/${w.slug}`,
        subdomainUrl,
        subdomainEnabled: w.subdomainEnabled,
      };
    }),
  };
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

  // Slug must be globally unique (schema enforces per-owner uniqueness only,
  // but public URLs are `/s/{slug}/` — two owners sharing a slug would collide
  // at the public route). Pre-check across all non-deleted websites. Deleted
  // sites' slugs are free to reuse since the loader filters them out.
  let website;
  const MAX_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = [randomFrom(NOUNS), randomFrom(PARTICIPLES_PRESENT)].join("-");
    const taken = await db.website.findFirst({
      where: { slug, status: { not: "DELETED" } },
      select: { id: true },
    });
    if (taken) continue;
    try {
      website = await db.website.create({
        data: { name, slug, ownerId: ctx.user.id, prefix: "" },
      });
      break;
    } catch (err: unknown) {
      const isPrismaUnique =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (!isPrismaUnique || attempt === MAX_ATTEMPTS - 1) throw err;
    }
  }

  if (!website) throw new Error("No se pudo generar un slug único para el website");

  const updated = await db.website.update({
    where: { id: website.id },
    data: { prefix: `sites/${website.id}/` },
  });

  // Path-based serving by default — no SSL cert emitted.
  // Subdomain masking is opt-in from the dashboard (see enableSubdomainMasking).
  const result = {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    prefix: updated.prefix,
    url: `https://www.easybits.cloud/s/${updated.slug}`,
    subdomainUrl: null as string | null,
    subdomainEnabled: false,
  };
  dispatchWebhooks(ctx.user.id, "website.created", result);
  return result;
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
  const subdomainUrl = website.subdomainEnabled
    ? `https://${website.slug}.easybits.cloud`
    : null;
  return {
    id: website.id,
    name: website.name,
    slug: website.slug,
    status: website.status,
    fileCount: website.fileCount,
    totalSize: website.totalSize,
    prefix: website.prefix,
    createdAt: website.createdAt,
    // For back-compat, sites with subdomain enabled keep url=subdomain (was the only URL before).
    // New path-based-only sites get url=path.
    url: subdomainUrl ?? `https://www.easybits.cloud/s/${website.slug}`,
    subdomainUrl,
    subdomainEnabled: website.subdomainEnabled,
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
  dispatchWebhooks(ctx.user.id, "website.deleted", { id: website.id, name: website.name, slug: website.slug });
  return { ok: true };
}

// --- Workspaces ---

function slugifyWorkspace(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace"
  );
}

function serializeWorkspace(w: {
  id: string;
  name: string;
  slug: string;
  status: string;
  quotaBytes: number | null;
  usedBytes: number;
  fileCount: number;
  createdAt: Date;
}) {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    quotaBytes: w.quotaBytes,
    usedBytes: w.usedBytes,
    fileCount: w.fileCount,
    createdAt: w.createdAt,
  };
}

/** Account plan storage ceiling in bytes (the hard cap workspace quotas sum under). */
function accountMaxBytes(ctx: AuthContext): number {
  return PLANS[getUserPlan(ctx.user)].storageGB * 1024 * 1024 * 1024;
}

export async function listWorkspaces(
  ctx: AuthContext,
  opts?: { limit?: number; cursor?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 50, 100);
  const where: any = {
    ownerId: ctx.user.id,
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  };
  // A workspace-scoped key can only ever see its own workspace.
  if (ctx.workspaceId) where.id = ctx.workspaceId;

  const rows = await db.workspace.findMany({
    where,
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(serializeWorkspace);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
}

export async function createWorkspace(
  ctx: AuthContext,
  opts: { name: string; slug?: string; quotaBytes?: number }
) {
  requireScope(ctx, "WRITE");
  // Managing workspaces is an account-level concern — a workspace-scoped key
  // (which is confined to one workspace's files) cannot create new ones.
  if (ctx.workspaceId) {
    throw new Response(JSON.stringify({ error: "A workspace-scoped key cannot manage workspaces" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const name = (opts.name || "").trim();
  if (!name) {
    throw new Response(JSON.stringify({ error: "Name required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (opts.quotaBytes != null && (opts.quotaBytes < 0 || opts.quotaBytes > accountMaxBytes(ctx))) {
    throw new Response(JSON.stringify({ error: "quotaBytes must be between 0 and the account plan ceiling" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const base = slugifyWorkspace(opts.slug || name);
  let ws;
  const MAX_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${nanoid(4)}`;
    try {
      ws = await db.workspace.create({
        data: { name, slug, ownerId: ctx.user.id, quotaBytes: opts.quotaBytes ?? null },
      });
      break;
    } catch (err: unknown) {
      const isUnique = err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (!isUnique || attempt === MAX_ATTEMPTS - 1) throw err;
    }
  }
  if (!ws) throw new Error("Could not generate a unique workspace slug");

  const result = serializeWorkspace(ws);
  dispatchWebhooks(ctx.user.id, "workspace.created", result);
  return result;
}

export async function getWorkspace(ctx: AuthContext, workspaceId: string) {
  requireScope(ctx, "READ");
  requireWorkspace(ctx, workspaceId);
  const ws = await loadOwnedWorkspace(ctx, workspaceId);
  return serializeWorkspace(ws);
}

export async function updateWorkspace(
  ctx: AuthContext,
  workspaceId: string,
  opts: { name?: string; status?: string; quotaBytes?: number | null }
) {
  requireScope(ctx, "WRITE");
  requireWorkspace(ctx, workspaceId);
  await loadOwnedWorkspace(ctx, workspaceId);

  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.status !== undefined) updates.status = opts.status;
  if (opts.quotaBytes !== undefined) {
    if (opts.quotaBytes != null && (opts.quotaBytes < 0 || opts.quotaBytes > accountMaxBytes(ctx))) {
      throw new Response(JSON.stringify({ error: "quotaBytes must be between 0 and the account plan ceiling" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    updates.quotaBytes = opts.quotaBytes;
  }

  const updated = await db.workspace.update({ where: { id: workspaceId }, data: updates });
  return serializeWorkspace(updated);
}

export async function deleteWorkspace(ctx: AuthContext, workspaceId: string) {
  requireScope(ctx, "DELETE");
  requireWorkspace(ctx, workspaceId);
  const ws = await loadOwnedWorkspace(ctx, workspaceId);

  // Soft-delete every file in the workspace (recoverable within the 7-day window).
  await db.file.updateMany({
    where: { workspaceId, status: { not: "DELETED" } },
    data: { status: "DELETED", deletedAt: new Date() },
  });
  await db.workspace.update({
    where: { id: workspaceId },
    data: { status: "DELETED", deletedAt: new Date(), usedBytes: 0, fileCount: 0 },
  });
  dispatchWebhooks(ctx.user.id, "workspace.deleted", { id: ws.id, name: ws.name, slug: ws.slug });
  return { ok: true };
}

export async function getWorkspaceUsage(ctx: AuthContext, workspaceId: string) {
  requireScope(ctx, "READ");
  requireWorkspace(ctx, workspaceId);
  const ws = await loadOwnedWorkspace(ctx, workspaceId);
  return {
    workspaceId: ws.id,
    usedBytes: ws.usedBytes,
    quotaBytes: ws.quotaBytes,
    fileCount: ws.fileCount,
  };
}

export async function createWorkspaceKey(
  ctx: AuthContext,
  workspaceId: string,
  opts?: { name?: string; scopes?: ("READ" | "WRITE" | "DELETE")[] }
) {
  // Minting a workspace-scoped key creates a *more-restricted* credential inside
  // the caller's own account (confined to one workspace, scopes ≤ the caller's),
  // so WRITE is enough — no privilege escalation is possible. A workspace-scoped
  // key still cannot mint further keys.
  requireScope(ctx, "WRITE");
  if (ctx.workspaceId) {
    throw new Response(JSON.stringify({ error: "A workspace-scoped key cannot mint keys" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ws = await loadOwnedWorkspace(ctx, workspaceId);

  // Clamp the new key's scopes to what the caller actually holds (a key can
  // never grant more than it has). ADMIN callers may grant any of R/W/D.
  const requested = opts?.scopes ?? ["READ", "WRITE", "DELETE"];
  const callerHasAdmin = ctx.scopes.includes("ADMIN");
  const scopes = (["READ", "WRITE", "DELETE"] as const).filter(
    (s) => requested.includes(s) && (callerHasAdmin || ctx.scopes.includes(s))
  );

  const key = await createApiKey(ctx.user.id, {
    name: opts?.name || `workspace-${ws.slug}`,
    scopes: scopes.length ? scopes : ["READ"],
    workspaceId: ws.id,
  });
  // raw is returned exactly once — the caller must store it now.
  return { id: key.id, key: key.raw, prefix: key.prefix, scopes: key.scopes, workspaceId: ws.id };
}

// --- Usage Stats ---

export async function getUsageStats(ctx: AuthContext) {
  requireScope(ctx, "READ");

  const planKey = getUserPlan(ctx.user);

  const [fileStats, deletedCount, websiteCount, webhookCount, databaseCount, genLimit] = await Promise.all([
    db.file.aggregate({
      where: { ownerId: ctx.user.id, status: { not: "DELETED" } },
      _count: true,
      _sum: { size: true },
    }),
    db.file.count({ where: { ownerId: ctx.user.id, status: "DELETED" } }),
    db.website.count({ where: { ownerId: ctx.user.id, deletedAt: null } }),
    db.webhook.count({ where: { userId: ctx.user.id } }),
    db.database.count({ where: { userId: ctx.user.id } }),
    checkAiGenerationLimit(ctx.user.id),
  ]);

  const usedBytes = fileStats._sum.size ?? 0;
  const maxBytes = PLANS[planKey].storageGB * 1024 * 1024 * 1024;

  return {
    plan: planKey,
    storage: {
      usedBytes,
      maxBytes,
      usedGB: +(usedBytes / (1024 * 1024 * 1024)).toFixed(3),
      maxGB: PLANS[planKey].storageGB,
      percentUsed: +((usedBytes / maxBytes) * 100).toFixed(1),
    },
    counts: {
      files: fileStats._count,
      deletedFiles: deletedCount,
      websites: websiteCount,
      webhooks: webhookCount,
      databases: databaseCount,
    },
    aiGenerations: {
      used: genLimit.used,
      limit: genLimit.limit,
      remaining: genLimit.limit !== null ? Math.max(0, genLimit.limit - genLimit.used + genLimit.bonus) : null,
      bonus: genLimit.bonus,
    },
    ...buildUpgradeHint(planKey),
  };
}

function buildUpgradeHint(planKey: PlanKey) {
  const next = NEXT_PLAN[planKey];
  if (!next) return {};
  const p = PLANS[next];
  return {
    upgrade: {
      nextPlan: next,
      price: `${formatPrice(p.price)} MXN/mes`,
      url: "https://www.easybits.cloud/planes",
      highlights: p.features.slice(0, 4),
    },
  };
}

// --- Bulk Delete Files ---

export async function bulkDeleteFiles(ctx: AuthContext, fileIds: string[]) {
  requireScope(ctx, "DELETE");

  if (fileIds.length === 0 || fileIds.length > 100) {
    throw new Response(JSON.stringify({ error: "Provide 1-100 file IDs" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const files = await db.file.findMany({
    where: { id: { in: fileIds }, ownerId: ctx.user.id, status: { not: "DELETED" } },
    select: { id: true, name: true },
  });

  if (files.length === 0) {
    return { deleted: 0, ids: [] };
  }

  await db.file.updateMany({
    where: { id: { in: files.map((f) => f.id) } },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  fileEvents.emit("file:changed", ctx.user.id);
  for (const f of files) {
    dispatchWebhooks(ctx.user.id, "file.deleted", { id: f.id, name: f.name });
  }

  return { deleted: files.length, ids: files.map((f) => f.id) };
}

// --- Bulk Upload Files ---

export async function bulkUploadFiles(
  ctx: AuthContext,
  items: Array<{
    fileName: string;
    contentType: string;
    size: number;
    access?: "public" | "private";
  }>
) {
  requireScope(ctx, "WRITE");

  if (items.length === 0 || items.length > 20) {
    throw new Response(JSON.stringify({ error: "Provide 1-20 files" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const item of items) {
    const result = await uploadFile(ctx, { ...item, source: "sdk" });
    results.push(result);
  }

  return { items: results };
}

// --- List Permissions ---

export async function listPermissions(ctx: AuthContext, fileId: string) {
  requireScope(ctx, "READ");

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "File not found or not owner" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const permissions = await db.permission.findMany({
    where: { resourceType: "file", resourceId: fileId },
    include: {
      grantee: { select: { email: true, displayName: true } },
    },
  });

  return {
    items: permissions.map((p) => ({
      id: p.id,
      email: p.grantee.email,
      displayName: p.grantee.displayName,
      canRead: p.canRead,
      canWrite: p.canWrite,
      canDelete: p.canDelete,
      createdAt: p.createdAt,
    })),
  };
}

// --- Duplicate File ---

export async function duplicateFile(ctx: AuthContext, fileId: string, newName?: string) {
  requireScope(ctx, "WRITE");

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || file.ownerId !== ctx.user.id || file.status === "DELETED") {
    throw new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  requireWorkspace(ctx, file.workspaceId);

  // The copy inherits the source's workspace; enforce that workspace's quota.
  if (file.workspaceId) {
    const ws = await loadOwnedWorkspace(ctx, file.workspaceId);
    if (ws.quotaBytes != null && ws.usedBytes + file.size > ws.quotaBytes) {
      throw new Response(
        JSON.stringify({ error: `Workspace quota exceeded (${Math.round(ws.quotaBytes / 1048576)}MB).` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Create a new storage key (namespaced to the workspace if any) and copy the object
  const newStorageKey = file.workspaceId
    ? `ws/${file.workspaceId}/${ctx.user.id}/${nanoid(3)}`
    : `${ctx.user.id}/${nanoid(3)}`;
  const client = await getClientForFile(file.storageProviderId, ctx.user.id);

  const bucket = file.access === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  // Same prefix rules as toggleFileAccess: public objects live at the bucket
  // root (browser-readable), private objects under `mcp/`.
  const isLegacyMcpUrl = !!file.url && file.url.includes("/mcp/");
  const srcKey = file.storageProviderId
    ? file.storageKey
    : file.access === "public" && !isLegacyMcpUrl
      ? file.storageKey
      : `mcp/${file.storageKey}`;
  const dstKey = file.storageProviderId
    ? newStorageKey
    : file.access === "public"
      ? newStorageKey
      : `mcp/${newStorageKey}`;

  await copyObjectAcrossBuckets({ fromBucket: bucket, toBucket: bucket, key: srcKey, destKey: dstKey });

  const copy = await db.file.create({
    data: {
      name: newName || `Copy of ${file.name}`,
      storageKey: newStorageKey,
      slug: newStorageKey,
      size: file.size,
      contentType: file.contentType,
      ownerId: ctx.user.id,
      access: file.access,
      url: file.access === "public" ? buildPublicAssetUrl(dstKey) : "",
      status: "DONE",
      storageProviderId: file.storageProviderId,
      metadata: file.metadata,
      source: "duplicate",
      ...(file.workspaceId ? { workspaceId: file.workspaceId } : {}),
    },
  });

  if (file.workspaceId) await bumpWorkspaceUsage(file.workspaceId, file.size, 1);

  fileEvents.emit("file:changed", ctx.user.id);
  dispatchWebhooks(ctx.user.id, "file.created", { id: copy.id, name: copy.name, size: copy.size, contentType: copy.contentType, access: copy.access });
  return copy;
}

// --- Revoke Share Token ---

export async function revokeShareToken(ctx: AuthContext, tokenId: string) {
  requireScope(ctx, "DELETE");

  const token = await db.shareToken.findUnique({ where: { id: tokenId } });
  if (!token || token.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Share token not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.shareToken.delete({ where: { id: tokenId } });
  return { success: true };
}

// --- Revoke Permission ---

export async function revokePermission(ctx: AuthContext, permissionId: string) {
  requireScope(ctx, "DELETE");

  const permission = await db.permission.findUnique({ where: { id: permissionId } });
  if (!permission) {
    throw new Response(JSON.stringify({ error: "Permission not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify ownership of the file
  const file = await db.file.findUnique({ where: { id: permission.resourceId } });
  if (!file || file.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Permission not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.permission.delete({ where: { id: permissionId } });
  return { success: true };
}

// --- List Website Files ---

export async function listWebsiteFiles(
  ctx: AuthContext,
  websiteId: string,
  opts?: { limit?: number; cursor?: string }
) {
  requireScope(ctx, "READ");

  const website = await db.website.findUnique({ where: { id: websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const limit = Math.min(opts?.limit ?? 50, 100);

  const files = await db.file.findMany({
    where: {
      ownerId: ctx.user.id,
      name: { startsWith: website.prefix },
      status: { not: "DELETED" },
    },
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
      createdAt: true,
    },
  });

  const hasMore = files.length > limit;
  const items = hasMore ? files.slice(0, limit) : files;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor, hasMore };
}

// --- Upload Website File ---

export async function uploadWebsiteFile(
  ctx: AuthContext,
  opts: { websiteId: string; fileName: string; contentType: string; size: number; access?: "public" | "private" }
) {
  requireScope(ctx, "WRITE");

  const website = await db.website.findUnique({ where: { id: opts.websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (opts.size <= 0 || opts.size > 5_368_709_120) {
    throw new Response(JSON.stringify({ error: "Invalid file size" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const storageKey = `${ctx.user.id}/${nanoid(6)}`;
  const client = getPlatformPublicClient();
  const putUrl = await client.getPutUrl(storageKey);
  const publicUrl = buildPublicAssetUrl(storageKey);

  const name = `${website.prefix}${opts.fileName}`;

  // Upsert: if file with same name exists, update it
  const existing = await db.file.findFirst({
    where: { ownerId: ctx.user.id, name, status: { not: "DELETED" } },
  });

  let file;
  if (existing) {
    file = await db.file.update({
      where: { id: existing.id },
      data: { storageKey, size: opts.size, contentType: opts.contentType, status: "DONE", url: publicUrl },
    });
  } else {
    file = await db.file.create({
      data: {
        name,
        storageKey,
        slug: storageKey,
        size: opts.size,
        contentType: opts.contentType,
        ownerId: ctx.user.id,
        access: opts.access || "public",
        url: publicUrl,
        status: "DONE",
      },
    });
  }

  return { file, putUrl };
}

// --- Deploy Website File (direct content upload, no presigned URL) ---

export async function deployWebsiteFile(
  ctx: AuthContext,
  opts: {
    websiteId: string;
    fileName: string;
    contentType: string;
    content: string;
    encoding?: "text" | "base64";
  }
) {
  requireScope(ctx, "WRITE");

  const website = await db.website.findUnique({ where: { id: opts.websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = opts.encoding === "base64"
    ? Buffer.from(opts.content, "base64")
    : Buffer.from(opts.content, "utf-8");

  if (body.length > 1_048_576) {
    throw new Response(JSON.stringify({ error: "Content too large. Max 1MB for direct upload. Use upload_website_file for larger files." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const storageKey = `${ctx.user.id}/${nanoid(6)}`;
  const client = getPlatformPublicClient();
  await client.putObject(storageKey, body, opts.contentType);
  const publicUrl = buildPublicAssetUrl(storageKey);

  const name = `${website.prefix}${opts.fileName}`;

  // Upsert: if file with same name exists, update it
  const existing = await db.file.findFirst({
    where: { ownerId: ctx.user.id, name, status: { not: "DELETED" } },
  });

  let file;
  if (existing) {
    // Delete old storage object
    try { await client.deleteObject(existing.storageKey); } catch {}
    file = await db.file.update({
      where: { id: existing.id },
      data: { storageKey, size: body.length, contentType: opts.contentType, status: "DONE", url: publicUrl },
    });
  } else {
    file = await db.file.create({
      data: {
        name,
        storageKey,
        slug: storageKey,
        size: body.length,
        contentType: opts.contentType,
        ownerId: ctx.user.id,
        access: "public",
        url: publicUrl,
        status: "DONE",
      },
    });
  }

  // Refresh the website's file stats so the dashboard reflects reality.
  const stats = await db.file.aggregate({
    where: {
      name: { startsWith: website.prefix },
      ownerId: ctx.user.id,
      status: "DONE",
    },
    _count: true,
    _sum: { size: true },
  });
  const updateData: any = { fileCount: stats._count, totalSize: stats._sum.size ?? 0 };

  // If the deployed file is an HTML page, the cached og:image is now stale.
  // Clear the pointer and regenerate in the background so the next share
  // picks up the new content.
  const isHtml = /\.html?$/i.test(opts.fileName) || opts.contentType.startsWith("text/html");
  if (isHtml) {
    const meta = (website.metadata as Record<string, unknown>) || {};
    if (meta.ogImageUrl) {
      const { ogImageUrl: _drop, ogGeneratedAt: _drop2, ...rest } = meta as any;
      updateData.metadata = rest;
    }
  }
  await db.website.update({ where: { id: website.id }, data: updateData });

  if (isHtml) {
    import("./websiteOgScreenshot")
      .then((m) => m.generateWebsiteOg(website.id))
      .catch(() => {});
  }

  return { file };
}

// --- Inject HTML into existing website file ---

export async function injectWebsiteHtml(
  ctx: AuthContext,
  opts: {
    websiteId: string;
    fileName: string;
    selector: string;
    position: "replace" | "beforeend" | "afterbegin";
    html: string;
  }
) {
  requireScope(ctx, "WRITE");

  const website = await db.website.findUnique({ where: { id: opts.websiteId } });
  if (!website || website.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Website not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const name = `${website.prefix}${opts.fileName}`;
  const file = await db.file.findFirst({
    where: { ownerId: ctx.user.id, name, status: { not: "DELETED" } },
  });
  if (!file || !file.url) {
    throw new Response(JSON.stringify({ error: `File "${opts.fileName}" not found in website` }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch current HTML
  const res = await fetch(file.url);
  if (!res.ok) {
    throw new Response(JSON.stringify({ error: "Failed to fetch current file content" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const currentHtml = await res.text();

  // Parse and inject
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(currentHtml);
  const el = dom.window.document.querySelector(opts.selector);
  if (!el) {
    throw new Response(
      JSON.stringify({ error: `No element matches selector: ${opts.selector}` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const template = dom.window.document.createElement("template");
  template.innerHTML = opts.html;

  if (opts.position === "replace") {
    el.replaceWith(template.content);
  } else if (opts.position === "beforeend") {
    el.appendChild(template.content);
  } else if (opts.position === "afterbegin") {
    el.prepend(template.content);
  }

  const newHtml = dom.serialize();

  // Re-deploy
  return deployWebsiteFile(ctx, {
    websiteId: opts.websiteId,
    fileName: opts.fileName,
    contentType: "text/html",
    content: newHtml,
  });
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

  return { items, nextCursor, hasMore };
}
