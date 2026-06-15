import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (en su lugar antes de importar el SUT) ───────────────────────────
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("~/.server/db", () => ({
  db: {
    user: {
      updateMany: (...a: any[]) => mockUpdateMany(...a),
      findUnique: (...a: any[]) => mockFindUnique(...a),
      update: (...a: any[]) => mockUpdate(...a),
    },
  },
}));

const mockPiCreate = vi.fn();
vi.mock("~/.server/stripe", () => ({
  getStripe: () => ({ paymentIntents: { create: (...a: any[]) => mockPiCreate(...a) } }),
}));

const mockCreditPack = vi.fn();
vi.mock("~/.server/core/creditPack", () => ({
  creditPack: (...a: any[]) => mockCreditPack(...a),
}));

const mockSendEmail = vi.fn();
vi.mock("~/.server/emails/sendAutoTopup", () => ({
  sendAutoTopupEmail: (...a: any[]) => mockSendEmail(...a),
}));

vi.mock("~/.server/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { maybeAutoTopup } = await import("~/.server/core/autoTopup");
const { findPackById } = await import("~/lib/plans");

// ── Helpers ─────────────────────────────────────────────────────────────────
const lockWon = () => mockUpdateMany.mockResolvedValue({ count: 1 });
const lockLost = () => mockUpdateMany.mockResolvedValue({ count: 0 });

function userWith(cfg: Partial<any>) {
  mockFindUnique.mockResolvedValue({
    email: "u@test.com",
    customer: "cus_123",
    autoTopup: {
      enabled: true,
      packId: "pack_10",
      paymentMethod: "pm_123",
      charging: true,
      chargeEpoch: 0,
      ...cfg,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockCreditPack.mockResolvedValue({ amount: 1000, bucket: "credits" });
  mockSendEmail.mockResolvedValue(undefined);
});

// ── findPackById (función pura) ──────────────────────────────────────────────
describe("findPackById", () => {
  it("resuelve un pack de créditos", () => {
    const p = findPackById("pack_10");
    expect(p).toMatchObject({ bucket: "credits", type: "generation_pack", priceMxn: 69 });
    expect(p!.amount).toBeGreaterThan(0);
  });

  it("resuelve un pack de tokens", () => {
    const p = findPackById("llm_5m");
    expect(p).toMatchObject({
      bucket: "tokens",
      type: "llm_token_pack",
      amount: 5_000_000,
      priceMxn: 279,
    });
  });

  it("devuelve null para id desconocido", () => {
    expect(findPackById("nope")).toBeNull();
  });
});

// ── maybeAutoTopup (orquestación) ────────────────────────────────────────────
describe("maybeAutoTopup", () => {
  it("perdió el lock → no cobra ni acredita", async () => {
    lockLost();
    await maybeAutoTopup("u1", "credits");
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockPiCreate).not.toHaveBeenCalled();
    expect(mockCreditPack).not.toHaveBeenCalled();
  });

  it("bucket equivocado → libera lock, no cobra", async () => {
    lockWon();
    userWith({ packId: "pack_10" }); // pack de créditos
    await maybeAutoTopup("u1", "tokens"); // pero se agotaron tokens
    expect(mockPiCreate).not.toHaveBeenCalled();
    expect(mockCreditPack).not.toHaveBeenCalled();
    // liberó el lock
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { autoTopup: { upsert: { set: null, update: { charging: false } } } },
      }),
    );
  });

  it("sin payment method → desactiva y notifica fallo, no cobra", async () => {
    lockWon();
    userWith({ paymentMethod: null });
    await maybeAutoTopup("u1", "credits");
    expect(mockPiCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith("u@test.com", "failed", expect.any(Object));
    // failAutoTopup desactiva
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoTopup: { upsert: { set: null, update: expect.objectContaining({ enabled: false }) } },
        }),
      }),
    );
  });

  it("éxito → cobra con monto+idempotencyKey correctos, acredita, avanza epoch, notifica", async () => {
    lockWon();
    userWith({ chargeEpoch: 4 });
    mockPiCreate.mockResolvedValue({ status: "succeeded" });

    await maybeAutoTopup("u1", "credits");

    // monto = 69 MXN * 100 = 6900 centavos; idempotencyKey con epoch
    expect(mockPiCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 6900,
        currency: "mxn",
        customer: "cus_123",
        payment_method: "pm_123",
        off_session: true,
        confirm: true,
      }),
      { idempotencyKey: "autotopup_u1_4" },
    );
    expect(mockCreditPack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", packId: "pack_10", channel: "auto_topup" }),
    );
    // avanza epoch a 5 y libera lock
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          autoTopup: {
            upsert: {
              set: null,
              update: expect.objectContaining({ charging: false, chargeEpoch: 5 }),
            },
          },
        },
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith("u@test.com", "success", expect.any(Object));
  });

  it("tarjeta rechazada → desactiva, notifica fallo, NO acredita (un solo intento)", async () => {
    lockWon();
    userWith({});
    mockPiCreate.mockRejectedValue(Object.assign(new Error("card declined"), { code: "card_declined" }));

    await maybeAutoTopup("u1", "credits");

    expect(mockCreditPack).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith("u@test.com", "failed", expect.any(Object));
    // desactiva Y avanza epoch (evita colisión de idempotency key tras reactivar)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoTopup: {
            upsert: {
              set: null,
              update: expect.objectContaining({ enabled: false, chargeEpoch: 1 }),
            },
          },
        }),
      }),
    );
  });

  it("avanza epoch desde un valor distinto de 0 al fallar", async () => {
    lockWon();
    userWith({ chargeEpoch: 7 });
    mockPiCreate.mockRejectedValue(new Error("network"));
    await maybeAutoTopup("u1", "credits");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoTopup: {
            upsert: { set: null, update: expect.objectContaining({ chargeEpoch: 8 }) },
          },
        }),
      }),
    );
  });

  it("cobró pero falló acreditar → NO avisa fallo (el cargo es real), desactiva para no re-cobrar", async () => {
    lockWon();
    userWith({});
    mockPiCreate.mockResolvedValue({ status: "succeeded" });
    mockCreditPack.mockRejectedValue(new Error("db hiccup"));

    await maybeAutoTopup("u1", "credits");

    // el cobro ocurrió
    expect(mockPiCreate).toHaveBeenCalledOnce();
    // NO se manda email de éxito (créditos no llegaron) ni de fallo (sí pagó)
    expect(mockSendEmail).not.toHaveBeenCalled();
    // se desactiva para frenar el loop de re-cobro
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoTopup: {
            upsert: { set: null, update: expect.objectContaining({ enabled: false }) },
          },
        }),
      }),
    );
  });
});
