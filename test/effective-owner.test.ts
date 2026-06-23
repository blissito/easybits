import { describe, it, expect, vi, beforeEach } from "vitest";

// The load-bearing correctness fact for machine delegation: the OWNER's id (not
// the caller's) is what every box-addressed op sends to the owner-scoped host as
// X-Easybits-Owner. effectiveOwnerId is the single place that decides it.

let sandboxRow: any = null;
let agentRow: any = null;
const mockDb = {
  sandbox: { findUnique: vi.fn(async () => sandboxRow) },
  agent: { findFirst: vi.fn(async () => agentRow) },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

let canResult = false;
vi.mock("~/.server/delegation", () => ({
  SCOPES: { MACHINES: "machines", FILES: "files", DBS: "dbs" },
  can: vi.fn(async () => canResult),
}));

const { effectiveOwnerId } = await import("~/.server/core/sandboxOperations");
const ctx = (id: string) => ({ user: { id }, scopes: ["WRITE"] } as any);

beforeEach(() => {
  sandboxRow = null;
  agentRow = null;
  canResult = false;
  vi.clearAllMocks();
});

describe("effectiveOwnerId (host owner-scoping + authz)", () => {
  it("ephemeral (no row) → caller's own id", async () => {
    sandboxRow = null;
    expect(await effectiveOwnerId(ctx("u1"), "sb_x")).toBe("u1");
  });

  it("owner → owner id", async () => {
    sandboxRow = { ownerId: "owner1" };
    expect(await effectiveOwnerId(ctx("owner1"), "sb_x")).toBe("owner1");
  });

  it("delegate (can=true) → OWNER id, not the delegate's", async () => {
    sandboxRow = { ownerId: "owner1" };
    canResult = true;
    expect(await effectiveOwnerId(ctx("delegate1"), "sb_x")).toBe("owner1");
  });

  it("stranger (can=false) → 404, never reaches the host", async () => {
    sandboxRow = { ownerId: "owner1" };
    canResult = false;
    await expect(effectiveOwnerId(ctx("stranger"), "sb_x")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("unified: agent box (no sandbox row, db.agent owns it) → delegate resolves agent owner", async () => {
    sandboxRow = null;          // not a permanent machine
    agentRow = { ownerId: "owner1" }; // tracked as an agent
    canResult = true;           // delegate
    expect(await effectiveOwnerId(ctx("delegate1"), "sb_agent")).toBe("owner1");
  });
});
