import { describe, expect, it, vi } from "vitest";

vi.mock("~/.server/db", () => ({ db: {} }));
vi.mock("~/.server/core/fleetAgentOperations", () => ({
  createFleetAgent: vi.fn(),
  routeMessage: vi.fn(),
  FleetAgentAtCapacity: class extends Error {},
  FleetAgentRateLimited: class extends Error {},
}));
vi.mock("~/.server/core/fleetAdmitHold", () => ({ withAdmitRetry: (run: () => unknown) => run() }));

import { bittorPricesPrompt } from "~/.server/core/bittor";
import { PLANS } from "~/lib/plans";

describe("Bittor", () => {
  it("la tabla de precios del turno sale de PLANS y siempre en MXN", () => {
    const prompt = bittorPricesPrompt();
    for (const p of Object.values(PLANS)) {
      expect(prompt).toContain(`${p.name}: $${p.promoPrice ?? p.price} MXN/mes`);
    }
    expect(prompt).not.toMatch(/USD|dólar/i);
  });
});
