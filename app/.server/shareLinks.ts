import jwt from "jsonwebtoken";
import type { Prisma, User, ShareLink } from "@prisma/client";
import { db } from "./db";

const SECRET = process.env.SECRET || "easybitscloud_not_secure";
const SHARE_COOKIE = "eb_share";

const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const MAX_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

export type ShareResourceType = "document" | "landing";
export type SharePermission = "view" | "edit" | "download";
export type ShareSource = "mcp" | "ui" | "sdk";

interface JwtPayload {
  sid: string;
  rt: ShareResourceType;
  rid: string;
  perm: SharePermission;
}

function getBaseUrl(): string {
  return process.env.NODE_ENV === "production"
    ? "https://www.easybits.cloud"
    : "http://localhost:3000";
}

function buildShareUrl(token: string, permission: SharePermission, resourceId: string): string {
  const base = getBaseUrl();
  if (permission === "download") {
    return `${base}/api/v2/documents/${resourceId}/pdf?token=${token}`;
  }
  return `${base}/share/${token}`;
}

async function ensureOwnership(
  resourceType: ShareResourceType,
  resourceId: string,
  ownerId: string
): Promise<void> {
  if (resourceType === "document" || resourceType === "landing") {
    const landing = await db.landing.findFirst({
      where: { id: resourceId, ownerId },
      select: { id: true },
    });
    if (!landing) {
      throw new Error(`Resource not found or not owned: ${resourceType}/${resourceId}`);
    }
    return;
  }
  throw new Error(`Unsupported resourceType: ${resourceType}`);
}

export async function createShareLink(input: {
  resourceType: ShareResourceType;
  resourceId: string;
  permission: SharePermission;
  ownerId: string;
  expiresIn?: number;
  source?: ShareSource;
}) {
  const expiresIn = Math.min(
    Math.max(input.expiresIn ?? DEFAULT_EXPIRY_SECONDS, 60),
    MAX_EXPIRY_SECONDS
  );
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await ensureOwnership(input.resourceType, input.resourceId, input.ownerId);

  const shareLink = await db.shareLink.create({
    data: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      permission: input.permission,
      ownerId: input.ownerId,
      source: input.source ?? "mcp",
      expiresAt,
    },
  });

  const payload: JwtPayload = {
    sid: shareLink.id,
    rt: input.resourceType,
    rid: input.resourceId,
    perm: input.permission,
  };
  const token = jwt.sign(payload, SECRET, { expiresIn });

  return {
    url: buildShareUrl(token, input.permission, input.resourceId),
    token,
    shareLink,
    expiresAt,
  };
}

export type ShareVerifyResult =
  | { ok: true; link: ShareLink; payload: JwtPayload }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "not_found" };

export async function verifyShareToken(token: string): Promise<ShareVerifyResult> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, SECRET) as JwtPayload;
  } catch (e: unknown) {
    const isExpired = e instanceof Error && e.name === "TokenExpiredError";
    return { ok: false, reason: isExpired ? "expired" : "invalid" };
  }

  if (!payload.sid || !payload.rt || !payload.rid || !payload.perm) {
    return { ok: false, reason: "invalid" };
  }

  const link = await db.shareLink.findUnique({ where: { id: payload.sid } });
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Bump usage stats — fire and forget; don't block on failures.
  db.shareLink
    .update({
      where: { id: link.id },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    })
    .catch(() => undefined);

  return { ok: true, link, payload };
}

export async function revokeShareLink(id: string, ownerId: string) {
  const link = await db.shareLink.findUnique({ where: { id } });
  if (!link || link.ownerId !== ownerId) {
    throw new Error("Share link not found");
  }
  return db.shareLink.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

/**
 * Cookie helpers for guest share sessions.
 * The cookie holds the same JWT that's in the URL — kept HttpOnly so it can't
 * be exfiltrated by injected scripts in the editor.
 */
export function buildShareCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SHARE_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function clearShareCookie(): string {
  return `${SHARE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function readShareCookie(request: Request): string | null {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const [name, ...rest] = part.split("=");
    if (name === SHARE_COOKIE && rest.length) {
      return rest.join("=");
    }
  }
  return null;
}

/**
 * Lightweight check: is there a valid share cookie on this request? Does not
 * scope to a specific resource. Use this in layout loaders that need to skip
 * the login redirect; the child route's loader still validates resource scope.
 */
export async function hasValidShareCookie(request: Request): Promise<boolean> {
  const token = readShareCookie(request);
  if (!token) return false;
  const result = await verifyShareToken(token);
  return result.ok;
}

/**
 * Returns the active guest share session for the request, scoped to the given
 * resource. Returns null if there's no cookie, the token is invalid/expired,
 * or the resource doesn't match.
 */
export async function getShareSession(
  request: Request,
  expected: { resourceType: ShareResourceType; resourceId: string }
): Promise<{ link: ShareLink; owner: User; permission: SharePermission } | null> {
  const token = readShareCookie(request);
  if (!token) return null;
  const result = await verifyShareToken(token);
  if (!result.ok) return null;
  const { link, payload } = result;
  if (link.resourceType !== expected.resourceType) return null;
  if (link.resourceId !== expected.resourceId) return null;
  const owner = await db.user.findUnique({ where: { id: link.ownerId } });
  if (!owner) return null;
  return { link, owner, permission: payload.perm };
}

export async function listShareLinks(input: {
  ownerId: string;
  resourceType?: ShareResourceType;
  resourceId?: string;
  includeRevoked?: boolean;
}) {
  const where: Prisma.ShareLinkWhereInput = { ownerId: input.ownerId };
  if (input.resourceType) where.resourceType = input.resourceType;
  if (input.resourceId) where.resourceId = input.resourceId;
  if (!input.includeRevoked) where.revokedAt = null;
  return db.shareLink.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}
