import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "./db";
import type { User } from "@prisma/client";

// Lazy: resolver el secreto en el PRIMER uso, no al importar el módulo. Si se
// evalúa al importar, el paso de prerender del build (NODE_ENV=production, sin
// JWT_SECRET en el entorno de build) revienta y tumba el deploy. El requisito
// en producción se mantiene — solo se difiere al runtime real.
let _secret: string | undefined;
function getSecret(): string {
  if (_secret) return _secret;
  const s =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret");
  if (!s) throw new Error("JWT_SECRET is required in production");
  _secret = s;
  return _secret;
}
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

export function issueAccessToken(userId: string, scope = "mcp", clientId?: string): {
  token: string;
  expiresIn: number;
} {
  // `cid` liga el access token a su concesión (usuario + cliente): al desconectar la app,
  // tryVerifyOAuthJwt lo rechaza aunque el JWT no haya caducado.
  const token = jwt.sign(
    { sub: userId, scope, typ: "oauth", ...(clientId ? { cid: clientId } : {}) },
    getSecret(),
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
  const { token, expiresIn } = issueAccessToken(row.userId, scope, clientId);
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
    const payload = jwt.verify(raw, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;
    if (payload.typ !== "oauth" || typeof payload.sub !== "string") return null;
    // Concesión revocada (app desconectada): ya no queda ningún refresh vivo de ese cliente.
    if (typeof payload.cid === "string" && !(await hasActiveGrant(payload.sub, payload.cid))) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * RFC 8707: el `resource` que un cliente pide en authorize/token. Sólo emitimos tokens
 * para nosotros mismos, así que vale el MCP (`/api/mcp` o `/api/mcp/<toolset>`) o el
 * origen; cualquier otro es `invalid_target`. Sin `resource` también vale (clientes viejos).
 */
export function isOwnResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  let u: URL;
  try {
    u = new URL(resource);
  } catch {
    return false;
  }
  const own = new URL(BASE_URL);
  // easybits.cloud y www.easybits.cloud son el mismo servidor.
  const host = (h: string) => h.replace(/^www\./, "");
  if (u.protocol !== own.protocol || host(u.host) !== host(own.host)) return false;
  const path = u.pathname.replace(/\/+$/, "");
  return path === "" || path === "/api/mcp" || path.startsWith("/api/mcp/");
}

// ── Concesiones (usuario + cliente) y revocación ─────────────────────────────
//
// Una "app conectada" es una concesión: los refresh tokens vivos de un cliente para un
// usuario. Revocarla marca TODOS sus refresh como revocados, y como cada access token
// lleva `cid`, también deja de valer el access en curso (no hay que esperar la hora).

/** ¿Queda algún refresh token vivo de este cliente para este usuario? */
export async function hasActiveGrant(userId: string, clientId: string): Promise<boolean> {
  const row = await db.oAuthRefreshToken.findFirst({
    where: { userId, clientId, revoked: false, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return !!row;
}

/** Revoca la concesión completa (todos los refresh, y con ellos los access). */
export async function revokeGrant(userId: string, clientId: string): Promise<number> {
  const { count } = await db.oAuthRefreshToken.updateMany({
    where: { userId, clientId, revoked: false },
    data: { revoked: true },
  });
  return count;
}

/**
 * RFC 7009: revoca a partir de un token (refresh opaco o access JWT). Siempre "éxito"
 * hacia afuera: un token desconocido no se distingue de uno ya revocado.
 * `clientId`, si viene, debe ser el dueño del token.
 */
export async function revokeByToken(raw: string, clientId?: string): Promise<void> {
  const row = await db.oAuthRefreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (row) {
    if (clientId && row.clientId !== clientId) return;
    await revokeGrant(row.userId, row.clientId);
    return;
  }
  try {
    const payload = jwt.verify(raw, getSecret(), { issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    if (payload.typ !== "oauth" || typeof payload.sub !== "string" || typeof payload.cid !== "string") return;
    if (clientId && payload.cid !== clientId) return;
    await revokeGrant(payload.sub, payload.cid);
  } catch {
    // token inválido o caducado: nada que revocar
  }
}

export type ConnectedApp = { clientId: string; clientName: string; connectedAt: Date; lastUsedAt: Date };

/** Apps con una concesión viva para el usuario (para «Apps conectadas»). */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const rows = await db.oAuthRefreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    select: { clientId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const byClient = new Map<string, Date>();
  for (const r of rows) if (!byClient.has(r.clientId)) byClient.set(r.clientId, r.createdAt);
  if (!byClient.size) return [];
  const [clients, firsts] = await Promise.all([
    db.oAuthClient.findMany({ where: { clientId: { in: [...byClient.keys()] } }, select: { clientId: true, clientName: true } }),
    // Primera vez que se conectó = refresh más viejo de la concesión (vivo o rotado).
    db.oAuthRefreshToken.groupBy({ by: ["clientId"], where: { userId, clientId: { in: [...byClient.keys()] } }, _min: { createdAt: true } }),
  ]);
  const names = new Map(clients.map((c) => [c.clientId, c.clientName]));
  const first = new Map(firsts.map((f) => [f.clientId, f._min.createdAt]));
  return [...byClient.entries()].map(([clientId, lastUsedAt]) => ({
    clientId,
    clientName: names.get(clientId) ?? clientId,
    connectedAt: first.get(clientId) ?? lastUsedAt,
    lastUsedAt,
  }));
}
