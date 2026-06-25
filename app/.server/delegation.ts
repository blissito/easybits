/**
 * Micro-IAM — account-level delegation by scope.
 *
 * An owner delegates scopes of THEIR account to another account (by email).
 * Today the only wired scope is `machines` (operate all the owner's permanent
 * machines from your own account). `files`/`dbs` are reserved strings for when
 * those surfaces add a `can()` check (e.g. Brendi: files + photos UI).
 *
 * One model (`Delegation`), one check (`can`). No roles, no per-resource ACL —
 * a scope grant is binary (you have it or you don't). Release/billing stay
 * owner-only and are enforced at their own call sites, not here.
 *
 * NOTE: `iam.ts` is a separate concern (API-key issuance) — do not confuse.
 */
import type { AuthContext } from "./apiAuth";
import { db } from "./db";
import logger from "./logger";

export const SCOPES = {
  MACHINES: "machines",
  FILES: "files",
  DBS: "dbs",
  // Operate the owner's whole AGENT fleet (pools + standalone agents): list,
  // suspend/resume, message, admin. Destroy stays owner-only at its call site.
  AGENTS: "agents",
  // Full-account impersonation eligibility — the grantee may "operate as" this
  // account (the whole dash flips context). Used by /dash/cuentas + getters.
  ACCOUNT: "account",
} as const;
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

const ALL_SCOPES: string[] = Object.values(SCOPES);

function fail(status: number, error: string, message: string): never {
  throw new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Does `ctx.user` hold `scope` over `accountId`'s account?
 * True for the owner themselves (owners have implicit full access). Pure read;
 * safe on the hot path.
 */
export async function can(
  ctx: AuthContext,
  accountId: string,
  scope: Scope
): Promise<boolean> {
  if (accountId === ctx.user.id) return true; // owner: implicit full access
  const grant = await db.delegation.findFirst({
    where: { accountId, granteeId: ctx.user.id, scopes: { has: scope } },
    select: { id: true },
  });
  return !!grant;
}

/** Account ids that have delegated `scope` to `ctx.user` (excludes own account). */
export async function delegatedAccountIds(
  ctx: AuthContext,
  scope: Scope
): Promise<string[]> {
  const grants = await db.delegation.findMany({
    where: { granteeId: ctx.user.id, scopes: { has: scope } },
    select: { accountId: true },
  });
  return grants.map((g) => g.accountId);
}

function normalizeScopes(scopes: string[]): string[] {
  const clean = [...new Set(scopes.map((s) => s.trim().toLowerCase()))].filter(Boolean);
  const bad = clean.filter((s) => !ALL_SCOPES.includes(s));
  if (bad.length) fail(400, "UnknownScope", `Scopes inválidos: ${bad.join(", ")}. Válidos: ${ALL_SCOPES.join(", ")}.`);
  if (!clean.length) fail(400, "NoScopes", "Indica al menos un scope.");
  return clean;
}

/** Owner (ctx.user) delegates `scopes` of their account to `email`. Idempotent: merges scopes. */
export async function grantAccess(ctx: AuthContext, email: string, scopes: string[]) {
  const wanted = normalizeScopes(scopes);
  const grantee = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!grantee) fail(400, "GranteeNotFound", "No existe una cuenta EasyBits con ese email.");
  if (grantee.id === ctx.user.id) fail(400, "CannotDelegateToSelf", "Ya eres el dueño de tu cuenta.");

  const existing = await db.delegation.findFirst({
    where: { accountId: ctx.user.id, granteeId: grantee.id },
  });
  if (existing) {
    const merged = [...new Set([...existing.scopes, ...wanted])];
    await db.delegation.update({ where: { id: existing.id }, data: { scopes: merged } });
    logger.info(`[delegation] grant updated account=${ctx.user.id} grantee=${grantee.id} email=${email} scopes=${merged.join(",")}`);
    return { ok: true as const, email, scopes: merged };
  }
  await db.delegation.create({
    data: { accountId: ctx.user.id, granteeId: grantee.id, grantedById: ctx.user.id, scopes: wanted },
  });
  logger.info(`[delegation] grant created account=${ctx.user.id} grantee=${grantee.id} email=${email} scopes=${wanted.join(",")}`);
  return { ok: true as const, email, scopes: wanted };
}

/** Owner revokes scopes from `email`. Omit `scopes` to revoke ALL (delete the grant). Idempotent. */
export async function revokeAccess(ctx: AuthContext, email: string, scopes?: string[]) {
  const grantee = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!grantee) return { ok: true as const }; // idempotent
  const grant = await db.delegation.findFirst({
    where: { accountId: ctx.user.id, granteeId: grantee.id },
  });
  if (!grant) return { ok: true as const };
  if (!scopes || !scopes.length) {
    await db.delegation.delete({ where: { id: grant.id } });
    logger.info(`[delegation] revoke(all) account=${ctx.user.id} grantee=${grantee.id} email=${email}`);
    return { ok: true as const, scopes: [] as string[] };
  }
  const drop = new Set(scopes.map((s) => s.trim().toLowerCase()));
  const remaining = grant.scopes.filter((s) => !drop.has(s));
  if (!remaining.length) {
    await db.delegation.delete({ where: { id: grant.id } });
    logger.info(`[delegation] revoke(empty) account=${ctx.user.id} grantee=${grantee.id} email=${email}`);
    return { ok: true as const, scopes: [] as string[] };
  }
  await db.delegation.update({ where: { id: grant.id }, data: { scopes: remaining } });
  logger.info(`[delegation] revoke account=${ctx.user.id} grantee=${grantee.id} email=${email} remaining=${remaining.join(",")}`);
  return { ok: true as const, scopes: remaining };
}

/** List who I (ctx.user) have delegated my account to, and with which scopes. */
export async function listAccess(ctx: AuthContext) {
  const grants = await db.delegation.findMany({
    where: { accountId: ctx.user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!grants.length) return [];
  const users = await db.user.findMany({
    where: { id: { in: grants.map((g) => g.granteeId) } },
    select: { id: true, email: true, displayName: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return grants.map((g) => ({
    email: byId.get(g.granteeId)?.email ?? null,
    displayName: byId.get(g.granteeId)?.displayName ?? null,
    scopes: g.scopes,
    createdAt: g.createdAt,
  }));
}

/* --------------------------------------------------------------------------
 * Impersonation ("operar como") — built on the same Delegation rows.
 *
 * The roster is `Delegation` rows where granteeId = operator and scopes has
 * `account`. canImpersonate = membership in that roster (re-checked every
 * request in getters, so a forged cookie can't impersonate). Self-adding a
 * client (addClientAccount) is admin-gated at the call site since it grants
 * access without the client's own action.
 * ------------------------------------------------------------------------ */

/** May `operatorId` operate as `targetId`? (roster membership, scope `account`) */
export async function canImpersonate(
  operatorId: string,
  targetId: string
): Promise<boolean> {
  if (!targetId || targetId === operatorId) return false;
  const grant = await db.delegation.findFirst({
    where: { accountId: targetId, granteeId: operatorId, scopes: { has: SCOPES.ACCOUNT } },
    select: { id: true },
  });
  return !!grant;
}

/** Accounts `operatorId` may operate as. Resolved to {id, email, displayName}. */
export async function listClients(operatorId: string) {
  const grants = await db.delegation.findMany({
    where: { granteeId: operatorId, scopes: { has: SCOPES.ACCOUNT } },
    orderBy: { createdAt: "desc" },
  });
  if (!grants.length) return [];
  const users = await db.user.findMany({
    where: { id: { in: grants.map((g) => g.accountId) } },
    select: { id: true, email: true, displayName: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return grants
    .map((g) => ({
      id: g.accountId,
      email: byId.get(g.accountId)?.email ?? null,
      displayName: byId.get(g.accountId)?.displayName ?? null,
    }))
    .filter((c) => c.email);
}

/** Operator self-adds `clientEmail` to their roster (grants self `account` over it). Admin-gate at call site. */
export async function addClientAccount(operatorId: string, clientEmail: string) {
  const client = await db.user.findUnique({ where: { email: clientEmail }, select: { id: true } });
  if (!client) fail(400, "ClientNotFound", "No existe una cuenta EasyBits con ese email.");
  if (client.id === operatorId) fail(400, "CannotAddSelf", "Esa es tu propia cuenta.");
  const existing = await db.delegation.findFirst({
    where: { accountId: client.id, granteeId: operatorId },
  });
  if (existing) {
    if (!existing.scopes.includes(SCOPES.ACCOUNT)) {
      await db.delegation.update({
        where: { id: existing.id },
        data: { scopes: [...new Set([...existing.scopes, SCOPES.ACCOUNT])] },
      });
    }
    return { ok: true as const };
  }
  await db.delegation.create({
    data: { accountId: client.id, granteeId: operatorId, grantedById: operatorId, scopes: [SCOPES.ACCOUNT] },
  });
  logger.info(`[impersonation] client added operator=${operatorId} client=${client.id} email=${clientEmail}`);
  return { ok: true as const };
}

/** Operator removes `clientEmail` from roster (drops only `account` scope; keeps other delegated scopes). */
export async function removeClientAccount(operatorId: string, clientEmail: string) {
  const client = await db.user.findUnique({ where: { email: clientEmail }, select: { id: true } });
  if (!client) return { ok: true as const };
  const grant = await db.delegation.findFirst({
    where: { accountId: client.id, granteeId: operatorId },
  });
  if (!grant) return { ok: true as const };
  const remaining = grant.scopes.filter((s) => s !== SCOPES.ACCOUNT);
  if (remaining.length) {
    await db.delegation.update({ where: { id: grant.id }, data: { scopes: remaining } });
  } else {
    await db.delegation.delete({ where: { id: grant.id } });
  }
  logger.info(`[impersonation] client removed operator=${operatorId} client=${client.id} email=${clientEmail}`);
  return { ok: true as const };
}
