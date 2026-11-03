import { describe, it, expect, vi, beforeEach } from "vitest";

// Staff de una máquina = delegado con scope "machines": la ve y la opera, pero el cobro
// (liberar, cambiar modo, recrear) y la suscripción son del dueño. Y una suscripción
// puede cubrir varias máquinas que ya existían (traspaso), sin crear ninguna.

let rows: Record<string, any> = {};
const updates: any[] = [];
const mockDb = {
  sandbox: {
    findUnique: vi.fn(async ({ where }: any) => rows[where.sandboxId] ?? null),
    findMany: vi.fn(async ({ where }: any) =>
      Object.values(rows).filter((r) => r.stripeSubscriptionId === where.stripeSubscriptionId)),
    count: vi.fn(async ({ where }: any) =>
      Object.values(rows).filter((r) => r.stripeSubscriptionId === where.stripeSubscriptionId).length),
    update: vi.fn(async ({ where, data }: any) => {
      updates.push({ sandboxId: where.sandboxId, ...data });
      Object.assign(rows[where.sandboxId], data);
      return rows[where.sandboxId];
    }),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));
vi.mock("~/.server/delegation", () => ({
  SCOPES: { MACHINES: "machines", FILES: "files", DBS: "dbs", AGENTS: "agents", ACCOUNT: "account" },
  can: vi.fn(async () => true), // el que llama siempre es staff o dueño
  delegatedAccountIds: vi.fn(async () => []),
}));

const { releasePermanent, setMachineSleep, attachPaidMachines, assertMachineOwner } = await import(
  "~/.server/core/machineOperations"
);
const ctx = (id: string) => ({ user: { id }, scopes: ["READ", "WRITE", "DELETE"] } as any);
const box = (sandboxId: string, extra: object = {}) =>
  ({ sandboxId, ownerId: "jose", status: "running", tier: "nano", cpuMode: "shared", template: "node", sleep: false, diskAddonsGB: 0, ...extra });

beforeEach(() => {
  rows = {};
  updates.length = 0;
  vi.clearAllMocks();
});

describe("staff opera pero no cobra ni borra", () => {
  it("assertMachineOwner: dueño pasa, staff recibe 403", () => {
    expect(() => assertMachineOwner(ctx("jose"), { ownerId: "jose" }, "liberar")).not.toThrow();
    try {
      assertMachineOwner(ctx("brenda"), { ownerId: "jose" }, "liberar");
      throw new Error("no lanzó");
    } catch (e: any) {
      expect(e.status).toBe(403);
    }
  });

  it("releasePermanent desde staff → 403 sin tocar nada", async () => {
    rows.sb_1 = box("sb_1", { stripeSubscriptionId: "sub_1" });
    await expect(releasePermanent(ctx("brenda"), "sb_1")).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);
  });

  it("setMachineSleep desde staff → 403", async () => {
    rows.sb_1 = box("sb_1");
    await expect(setMachineSleep(ctx("brenda"), "sb_1", true)).rejects.toMatchObject({ status: 403 });
  });

  it("setMachineSleep en suscripción compartida → 409 (repreciar una cobraría a todas)", async () => {
    rows.sb_1 = box("sb_1", { stripeSubscriptionId: "sub_1" });
    rows.sb_2 = box("sb_2", { stripeSubscriptionId: "sub_1" });
    await expect(setMachineSleep(ctx("jose"), "sb_1", true)).rejects.toMatchObject({ status: 409 });
  });
});

describe("attachPaidMachines (checkout con eb_attach_ids)", () => {
  it("pega la suscripción a las máquinas del que pagó, sin cobro, y es idempotente", async () => {
    rows.sb_1 = box("sb_1");
    rows.sb_2 = box("sb_2");
    const r = await attachPaidMachines({ ownerId: "jose", subscriptionId: "sub_9", sandboxIds: ["sb_1", "sb_2"] });
    expect(r).toEqual({ attached: ["sb_1", "sb_2"], skipped: [] });
    expect(rows.sb_1.stripeSubscriptionId).toBe("sub_9");
    updates.length = 0;
    const again = await attachPaidMachines({ ownerId: "jose", subscriptionId: "sub_9", sandboxIds: ["sb_1", "sb_2"] });
    expect(again.attached).toEqual(["sb_1", "sb_2"]);
    expect(updates).toHaveLength(0);
  });

  it("salta las ajenas, las ya cobradas y las inexistentes", async () => {
    rows.sb_a = box("sb_a", { ownerId: "otro" });
    rows.sb_b = box("sb_b", { stripeSubItemId: "si_1" });
    const r = await attachPaidMachines({ ownerId: "jose", subscriptionId: "sub_9", sandboxIds: ["sb_a", "sb_b", "sb_x"] });
    expect(r).toEqual({ attached: [], skipped: ["sb_a", "sb_b", "sb_x"] });
    expect(updates).toHaveLength(0);
  });
});
