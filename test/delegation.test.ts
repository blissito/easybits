import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory db mock — only the bits delegation.ts touches.
const state = {
  delegations: [] as any[],
  users: [] as any[],
};
const mockDb = {
  delegation: {
    findFirst: vi.fn(async ({ where }: any) =>
      state.delegations.find(
        (d) =>
          (where.accountId === undefined || d.accountId === where.accountId) &&
          (where.granteeId === undefined || d.granteeId === where.granteeId) &&
          (where.scopes?.has === undefined || d.scopes.includes(where.scopes.has))
      ) ?? null
    ),
    findMany: vi.fn(async ({ where }: any) =>
      state.delegations.filter(
        (d) =>
          (where.accountId === undefined || d.accountId === where.accountId) &&
          (where.granteeId === undefined || d.granteeId === where.granteeId) &&
          (where.scopes?.has === undefined || d.scopes.includes(where.scopes.has))
      )
    ),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `d${state.delegations.length + 1}`, ...data };
      state.delegations.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.delegations.find((d) => d.id === where.id);
      Object.assign(row, data);
      return row;
    }),
    delete: vi.fn(async ({ where }: any) => {
      state.delegations = state.delegations.filter((d) => d.id !== where.id);
      return {};
    }),
  },
  user: {
    findUnique: vi.fn(async ({ where }: any) =>
      state.users.find((u) => u.email === where.email || u.id === where.id) ?? null
    ),
    findMany: vi.fn(async ({ where }: any) =>
      state.users.filter((u) => where.id.in.includes(u.id))
    ),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

const { can, grantAccess, revokeAccess, listAccess, delegatedAccountIds, SCOPES } =
  await import("~/.server/delegation");

const OWNER = { id: "owner1", email: "siiqtec@gmail.com" };
const GRANTEE = { id: "grantee1", email: "fixtergeek@gmail.com", displayName: "Fixter" };
const ctx = (id: string) => ({ user: { id }, scopes: ["WRITE"] } as any);

beforeEach(() => {
  state.delegations = [];
  state.users = [{ ...OWNER }, { ...GRANTEE }];
  vi.clearAllMocks();
});

describe("micro-IAM delegation", () => {
  it("can(): owner is implicitly allowed without a grant", async () => {
    expect(await can(ctx(OWNER.id), OWNER.id, SCOPES.MACHINES)).toBe(true);
  });

  it("can(): stranger with no grant is denied", async () => {
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.MACHINES)).toBe(false);
  });

  it("grant → can() true for that scope, false for another", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines"]);
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.MACHINES)).toBe(true);
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.FILES)).toBe(false);
  });

  it("delegatedAccountIds returns owners who granted me the scope", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines"]);
    expect(await delegatedAccountIds(ctx(GRANTEE.id), SCOPES.MACHINES)).toEqual([OWNER.id]);
    expect(await delegatedAccountIds(ctx(GRANTEE.id), SCOPES.FILES)).toEqual([]);
  });

  it("grant is idempotent and merges scopes", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines"]);
    const r = await grantAccess(ctx(OWNER.id), GRANTEE.email, ["files"]);
    expect(r.scopes.sort()).toEqual(["files", "machines"]);
    expect(state.delegations).toHaveLength(1);
  });

  it("unknown email → GranteeNotFound (400)", async () => {
    await expect(grantAccess(ctx(OWNER.id), "nobody@x.com", ["machines"])).rejects.toMatchObject({
      status: 400,
    });
  });

  it("invalid scope → UnknownScope (400)", async () => {
    await expect(grantAccess(ctx(OWNER.id), GRANTEE.email, ["wat"])).rejects.toMatchObject({
      status: 400,
    });
  });

  it("revoke without scopes deletes the grant", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines"]);
    await revokeAccess(ctx(OWNER.id), GRANTEE.email);
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.MACHINES)).toBe(false);
    expect(state.delegations).toHaveLength(0);
  });

  it("revoke one scope keeps the rest", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines", "files"]);
    await revokeAccess(ctx(OWNER.id), GRANTEE.email, ["files"]);
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.MACHINES)).toBe(true);
    expect(await can(ctx(GRANTEE.id), OWNER.id, SCOPES.FILES)).toBe(false);
  });

  it("listAccess shows grantees + scopes for the owner", async () => {
    await grantAccess(ctx(OWNER.id), GRANTEE.email, ["machines"]);
    const list = await listAccess(ctx(OWNER.id));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: GRANTEE.email, scopes: ["machines"] });
  });
});
