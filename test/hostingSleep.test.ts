import { describe, it, expect } from "vitest";
import { HOSTING_CATALOG, machineMonthly, sleepPrice, tierPrice } from "../app/lib/hostingCatalog";

describe("modo duerme sin visitas", () => {
  it("cuesta la mitad de shared, redondeado hacia abajo (micro $49)", () => {
    expect(sleepPrice(HOSTING_CATALOG.micro)).toBe(49);
    expect(machineMonthly(HOSTING_CATALOG.micro, "shared", 0, true)).toBe(49);
  });

  it("los add-ons de disco se cobran completos aunque duerma", () => {
    expect(machineMonthly(HOSTING_CATALOG.micro, "shared", 100, true)).toBe(49 + 99);
  });

  it("sin sleep el precio no cambia (máquinas ya vendidas)", () => {
    for (const tier of Object.values(HOSTING_CATALOG)) {
      expect(machineMonthly(tier, "shared")).toBe(tierPrice(tier, "shared"));
    }
  });
});
