import { describe, it, expect, vi, beforeEach } from "vitest";

// Cesión agencia → cliente: la oferta no mueve nada; el pago (webhook) traspasa, pega el cobro,
// reparte el precio acordado y deja a la agencia como staff. Idempotente.

let sandboxes: Record<string, any> = {};
let offers: Record<string, any> = {};
let users: Record<string, any> = {};
const hostCalls: any[] = [];
const secrets: Record<string, string> = {};
const grants: any[] = [];

const mockDb = {
  sandbox: {
    findUnique: vi.fn(async ({ where }: any) => sandboxes[where.sandboxId] ?? null),
    findMany: vi.fn(async ({ where }: any) => Object.values(sandboxes).filter((r) => where.sandboxId.in.includes(r.sandboxId))),
    update: vi.fn(async ({ where, data }: any) => Object.assign(sandboxes[where.sandboxId], data)),
    updateMany: vi.fn(async ({ where, data }: any) => {
      for (const id of where.sandboxId.in) Object.assign(sandboxes[id], data);
    }),
  },
  machineRelease: { updateMany: vi.fn(async () => ({ count: 0 })) },
  hostingOffer: {
    findUnique: vi.fn(async ({ where }: any) => offers[where.id] ?? null),
    findFirst: vi.fn(async ({ where }: any) =>
      Object.values(offers).find((o) => o.status === where.status && o.sandboxIds.some((id: string) => where.sandboxIds.hasSome.includes(id))) ?? null),
    findMany: vi.fn(async (_args?: any): Promise<any[]> => []),
    create: vi.fn(async ({ data }: any) => (offers.of1 = { id: "of1", status: "pending", createdAt: new Date(), note: null, ...data })),
    update: vi.fn(async ({ where, data }: any) => Object.assign(offers[where.id], data)),
  },
  user: { findUnique: vi.fn(async ({ where }: any) => users[where.id] ?? Object.values(users).find((u) => u.email === where.email) ?? null) },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));
vi.mock("~/.server/delegation", () => ({
  SCOPES: { MACHINES: "machines" },
  can: vi.fn(async () => false),
  delegatedAccountIds: vi.fn(async () => []),
  grantAccess: vi.fn(async (ctx: any, email: string, scopes: string[]) => grants.push({ from: ctx.user.id, email, scopes })),
}));
vi.mock("~/.server/emails/sendTransactional", () => ({ sendTransactional: vi.fn(async () => ({ messageId: "m" })) }));
const anchorSub = vi.fn(async (_id: string) => {});
vi.mock("~/.server/stripe_machines", async (orig) => ({
  ...(await orig<any>()),
  anchorSubscriptionToFirstOfMonth: anchorSub,
}));
vi.mock("~/.server/core/sandboxOperations", async (orig) => ({
  ...(await orig<any>()),
  reassignSandboxOwnerHost: vi.fn(async (id: string, owner: string, opts: any) => hostCalls.push({ id, owner, opts })),
}));
vi.mock("~/.server/core/secretOperations", async (orig) => ({
  ...(await orig<any>()),
  getSecretValue: vi.fn(async (u: string, n: string) => secrets[`${u}:${n}`] ?? null),
  createSecret: vi.fn(async (u: string, { name, value }: any) => { secrets[`${u}:${name}`] = value; }),
}));

const { createHostingOffer, completeHostingOffer, normalizeOfferItems, describeOfferItems, pendingOffersForEmail } = await import("~/.server/core/hostingOfferOperations");
const { machineSecretName } = await import("~/.server/core/secretOperations");
const ctx = (id: string) => ({ user: { id }, scopes: ["READ", "WRITE"] } as any);
const box = (sandboxId: string, ownerId: string, extra: object = {}) =>
  ({ sandboxId, ownerId, name: sandboxId, status: "running", runspec: { secretNames: ["JWT_SECRET"] }, ...extra });

beforeEach(() => {
  sandboxes = { sb_1: box("sb_1", "brenda"), sb_2: box("sb_2", "brenda") };
  offers = {};
  users = { brenda: { id: "brenda", email: "brenda@fixter.org" }, jose: { id: "jose", email: "joseluis@acaliclub.com" } };
  hostCalls.length = 0;
  grants.length = 0;
  for (const k of Object.keys(secrets)) delete secrets[k];
  secrets[`brenda:${machineSecretName("sb_1", "JWT_SECRET")}`] = "s1";
  secrets[`brenda:${machineSecretName("sb_2", "JWT_SECRET")}`] = "s2";
  vi.clearAllMocks();
});

describe("crear oferta", () => {
  it("la oferta no mueve nada: las máquinas siguen siendo de la agencia", async () => {
    const o = await createHostingOffer(ctx("brenda"), { clientEmail: "JoseLuis@AcaliClub.com", sandboxIds: ["sb_1", "sb_2"], monthlyMxn: 250 });
    expect(o.clientEmail).toBe("joseluis@acaliclub.com");
    expect(o.monthlyMxn).toBe(250);
    expect(sandboxes.sb_1.ownerId).toBe("brenda");
    expect(hostCalls).toHaveLength(0);
  });

  it("no se ceden máquinas ajenas ni ya cobradas", async () => {
    sandboxes.sb_3 = box("sb_3", "otro");
    await expect(createHostingOffer(ctx("brenda"), { clientEmail: "a@b.co", sandboxIds: ["sb_3"], monthlyMxn: 250 }))
      .rejects.toMatchObject({ status: 404 });
    sandboxes.sb_1.stripeSubscriptionId = "sub_x";
    await expect(createHostingOffer(ctx("brenda"), { clientEmail: "a@b.co", sandboxIds: ["sb_1"], monthlyMxn: 250 }))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe("desglose", () => {
  const ACALI = [
    { label: "apps", qty: 6, unitMxn: 250 },
    { label: "DBs administradas", qty: 6, unitMxn: 200, waived: true },
  ];

  it("lo bonificado no suma al total", () => {
    expect(normalizeOfferItems(ACALI).totalMxn).toBe(1500);
    expect(describeOfferItems(ACALI)).toContain("(descuento especial)");
  });

  it("la oferta guarda el desglose y cobra la suma", async () => {
    const o = await createHostingOffer(ctx("brenda"), { clientEmail: "joseluis@acaliclub.com", sandboxIds: ["sb_1", "sb_2"], items: ACALI });
    expect(o.monthlyMxn).toBe(1500);
    expect(o.items).toHaveLength(2);
  });

  it("rechaza filas inválidas", () => {
    expect(() => normalizeOfferItems([{ label: "apps", qty: 0, unitMxn: 250 }])).toThrow();
  });

  it("el banner encuentra la oferta pendiente del cliente", async () => {
    offers.of1 = { id: "of1", fromUserId: "brenda", clientEmail: "joseluis@acaliclub.com", sandboxIds: ["sb_1", "sb_2"], monthlyMxn: 500, status: "pending" };
    mockDb.hostingOffer.findMany.mockImplementationOnce(async ({ where }: any) =>
      Object.values(offers).filter((o) => o.clientEmail === where.clientEmail && o.status === where.status));
    expect(await pendingOffersForEmail("JoseLuis@acaliclub.com")).toMatchObject({ count: 1, apps: 2 });
  });
});

describe("completar oferta (webhook)", () => {
  beforeEach(() => {
    offers.of1 = { id: "of1", fromUserId: "brenda", clientEmail: "joseluis@acaliclub.com", sandboxIds: ["sb_1", "sb_2"], monthlyMxn: 250, status: "pending" };
  });

  it("traspasa con secretos, pega el cobro, reparte el precio y da staff a la agencia", async () => {
    const r = await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    expect(r.transferred).toEqual(["sb_1", "sb_2"]);
    expect(r.attached).toEqual(["sb_1", "sb_2"]);
    expect(sandboxes.sb_1).toMatchObject({ ownerId: "jose", stripeSubscriptionId: "sub_9", agreedMonthlyMxn: 125 });
    expect(secrets[`jose:${machineSecretName("sb_1", "JWT_SECRET")}`]).toBe("s1");
    expect(hostCalls.every((c) => c.opts?.asOperator)).toBe(true);
    expect(grants).toEqual([{ from: "jose", email: "brenda@fixter.org", scopes: ["machines"] }]);
    expect(offers.of1.status).toBe("paid");
  });

  it("con desglose, cada app guarda su precio aunque haya extras (correos)", async () => {
    offers.of1.items = [
      { label: "apps", qty: 2, unitMxn: 250 },
      { label: "DBs administradas", qty: 2, unitMxn: 200, waived: true },
      { label: "paquete de 500 correos al mes", qty: 1, unitMxn: 100 },
    ];
    offers.of1.monthlyMxn = 600;
    await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    expect(sandboxes.sb_1.agreedMonthlyMxn).toBe(250);
  });

  it("ancla la renovación al día 1; si Stripe falla, la oferta sigue pendiente y el reintento completa", async () => {
    anchorSub.mockRejectedValueOnce(new Error("stripe caído"));
    await expect(completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" })).rejects.toThrow();
    expect(offers.of1.status).toBe("pending");
    await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    expect(anchorSub).toHaveBeenLastCalledWith("sub_9");
    expect(offers.of1.status).toBe("paid");
  });

  it("el siguiente día 1 se calcula en hora de CDMX", async () => {
    const { nextFirstOfMonth } = await import("~/.server/stripe_machines");
    const iso = (s: string) => nextFirstOfMonth(new Date(s)).toISOString();
    expect(iso("2026-11-04T14:00:00Z")).toBe("2026-12-01T06:00:00.000Z");
    // 30 nov 23:30 en CDMX ya es 1 dic en UTC: sigue siendo noviembre, renueva en horas.
    expect(iso("2026-12-01T05:30:00Z")).toBe("2026-12-01T06:00:00.000Z");
    // Pagar el mismo día 1 renueva hasta el siguiente mes.
    expect(iso("2026-12-01T06:00:00Z")).toBe("2027-01-01T06:00:00.000Z");
    expect(iso("2026-12-15T12:00:00Z")).toBe("2027-01-01T06:00:00.000Z");
  });

  it("un replay del webhook no hace nada", async () => {
    await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    hostCalls.length = 0;
    await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    expect(hostCalls).toHaveLength(0);
  });

  it("si pagó otra cuenta, no traspasa nada", async () => {
    users.otro = { id: "otro", email: "otro@x.com" };
    await expect(completeHostingOffer({ offerId: "of1", clientUserId: "otro", subscriptionId: "sub_9" })).rejects.toThrow();
    expect(sandboxes.sb_1.ownerId).toBe("brenda");
  });

  it("máquinas ya traspasadas (caso Acali): sólo pega el cobro", async () => {
    sandboxes.sb_1.ownerId = "jose";
    sandboxes.sb_2.ownerId = "jose";
    const r = await completeHostingOffer({ offerId: "of1", clientUserId: "jose", subscriptionId: "sub_9" });
    expect(r.transferred).toEqual([]);
    expect(r.attached).toEqual(["sb_1", "sb_2"]);
    expect(hostCalls).toHaveLength(0);
  });
});
