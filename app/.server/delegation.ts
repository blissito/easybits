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

export const SCOPES = {
  MACHINES: "machines",
  FILES: "files",
  DBS: "dbs",
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
    return { ok: true as const, email, scopes: merged };
  }
  await db.delegation.create({
    data: { accountId: ctx.user.id, granteeId: grantee.id, scopes: wanted },
  });
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
    return { ok: true as const, scopes: [] as string[] };
  }
  const drop = new Set(scopes.map((s) => s.trim().toLowerCase()));
  const remaining = grant.scopes.filter((s) => !drop.has(s));
  if (!remaining.length) {
    await db.delegation.delete({ where: { id: grant.id } });
    return { ok: true as const, scopes: [] as string[] };
  }
  await db.delegation.update({ where: { id: grant.id }, data: { scopes: remaining } });
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
