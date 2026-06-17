import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (antes de importar el SUT) ──────────────────────────────────────────
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("~/.server/db", () => ({
  db: {
    user: {
      findUnique: (...a: any[]) => mockFindUnique(...a),
      update: (...a: any[]) => mockUpdate(...a),
    },
  },
}));

const mockAutoTopup = vi.fn();
vi.mock("~/.server/core/autoTopup", () => ({
  maybeAutoTopup: (...a: any[]) => mockAutoTopup(...a),
}));

const { checkLLMTokenLimit } = await import("~/.server/llmTokenLimit");

const BYTE = 5_000_000;
const MEGA = 10_000_000;
const DAY = 24 * 60 * 60 * 1000;

function userWith(cfg: Partial<any>) {
  mockFindUnique.mockResolvedValue({
    metadata: { plan: "Byte" },
    llmTokensUsed: 0,
    llmTokensResetAt: new Date(),
    llmTokensBonus: 0,
    autoTopup: null,
    ...cfg,
  });
}

// Reloj fijo en junio 2026 (dentro de la promo) para que los tests no dependan
// del reloj real. Los casos post-promo cambian el reloj explícitamente.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-17T12:00:00Z"));
  mockUpdate.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkLLMTokenLimit — Byte (grant one-time)", () => {
  it("primer request: sella resetAt una sola vez, no resetea used", async () => {
    userWith({ metadata: { plan: "Byte" }, llmTokensUsed: 0, llmTokensResetAt: null });
    const r = await checkLLMTokenLimit("u1");
    expect(r.planLimit).toBe(BYTE);
    expect(r.allowed).toBe(true);
    // marca resetAt pero NO toca used ni bonus
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ llmTokensResetAt: expect.any(Date) }),
      }),
    );
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("llmTokensUsed");
    expect(data).not.toHaveProperty("llmTokensBonus");
  });

  it("8 días después NO recarga: used persiste acumulado", async () => {
    userWith({
      metadata: { plan: "Byte" },
      llmTokensUsed: 3_000_000,
      llmTokensResetAt: new Date(Date.now() - 8 * DAY),
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.used).toBe(3_000_000);
    expect(r.remaining).toBe(BYTE - 3_000_000);
    expect(r.allowed).toBe(true);
    // resetAt ya existe → ni siquiera escribe
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("al consumir el grant completo: bloquea (402)", async () => {
    userWith({
      metadata: { plan: "Byte" },
      llmTokensUsed: BYTE,
      llmTokensResetAt: new Date(Date.now() - 30 * DAY),
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.remaining).toBe(0);
    expect(r.allowed).toBe(false);
  });

  it("bonus comprado suma al límite del grant agotado", async () => {
    userWith({
      metadata: { plan: "Byte" },
      llmTokensUsed: BYTE,
      llmTokensBonus: 1_000_000,
      llmTokensResetAt: new Date(),
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.limit).toBe(BYTE + 1_000_000);
    expect(r.remaining).toBe(1_000_000);
    expect(r.allowed).toBe(true);
  });

  it("post-promo SIN reclamar: no otorga (planLimit 0, bloqueado)", async () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z")); // promo cerrada
    userWith({ metadata: { plan: "Byte" }, llmTokensUsed: 0, llmTokensResetAt: null });
    const r = await checkLLMTokenLimit("u1");
    expect(r.planLimit).toBe(0);
    expect(r.allowed).toBe(false);
    expect(r.resetAt).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled(); // no sella nada
  });

  it("post-promo YA reclamado en junio: conserva su saldo", async () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    userWith({
      metadata: { plan: "Byte" },
      llmTokensUsed: 2_000_000,
      llmTokensResetAt: new Date("2026-06-20T00:00:00Z"), // reclamado en junio
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.planLimit).toBe(BYTE);
    expect(r.remaining).toBe(BYTE - 2_000_000);
    expect(r.allowed).toBe(true);
  });
});

describe("checkLLMTokenLimit — Mega (reset mensual, bonus persiste)", () => {
  it("pasado el mes: resetea used a 0 pero NO borra el bonus", async () => {
    userWith({
      metadata: { plan: "Mega" },
      llmTokensUsed: 8_000_000,
      llmTokensBonus: 2_000_000,
      llmTokensResetAt: new Date(Date.now() - 31 * DAY),
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.used).toBe(0);
    expect(r.bonus).toBe(2_000_000);
    expect(r.limit).toBe(MEGA + 2_000_000);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.llmTokensUsed).toBe(0);
    expect(data).not.toHaveProperty("llmTokensBonus");
  });

  it("dentro del mes: no resetea, descuenta normal", async () => {
    userWith({
      metadata: { plan: "Mega" },
      llmTokensUsed: 4_000_000,
      llmTokensBonus: 0,
      llmTokensResetAt: new Date(Date.now() - 5 * DAY),
    });
    const r = await checkLLMTokenLimit("u1");
    expect(r.used).toBe(4_000_000);
    expect(r.remaining).toBe(MEGA - 4_000_000);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
