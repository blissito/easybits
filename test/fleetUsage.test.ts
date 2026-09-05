import { describe, it, expect } from "vitest";
import { shouldChargeQuota } from "~/.server/core/fleetUsage";
import { engineIsMetered, getEngine } from "~/lib/fleetEngines";

// La regla económica de la flota, fijada para que no se afloje sin querer: se REGISTRA
// siempre (atribución), pero sólo se DESCUENTA cuota cuando EasyBits pone el motor.
// Cobrarle cuota a un dueño que trajo su propia llave es cobrarle dos veces.
describe("a quién se le descuenta cuota", () => {
  it("BYOK no descuenta: la llave es del dueño y ya paga a su proveedor", () => {
    for (const id of ["claude", "deepseek", "codex", "glm"]) {
      const engine = getEngine(id);
      expect(engineIsMetered(engine)).toBe(false);
      expect(shouldChargeQuota({ ownerId: "u", fleetAgentId: "f", groupId: "g", engine })).toBe(false);
    }
  });

  it("el motor medido de EasyBits sí descuenta", () => {
    const engine = getEngine("easybits");
    expect(engineIsMetered(engine)).toBe(true);
    expect(shouldChargeQuota({ ownerId: "u", fleetAgentId: "f", groupId: "g", engine })).toBe(true);
  });

  it("billingMode 'managed' cobra aunque el motor sea BYOK — es el gancho de reventa", () => {
    expect(
      shouldChargeQuota({
        ownerId: "u",
        fleetAgentId: "f",
        groupId: "g",
        engine: getEngine("deepseek"),
        billingMode: "managed",
      })
    ).toBe(true);
  });

  it("un motor sin bandera NO cobra: el fallo seguro es no cobrar", () => {
    expect(engineIsMetered({ })).toBe(false);
    expect(engineIsMetered(null)).toBe(false);
    expect(engineIsMetered(undefined)).toBe(false);
    expect(shouldChargeQuota({ ownerId: "u", fleetAgentId: "f", groupId: "g", engine: null })).toBe(false);
  });

  it("byok explícito con billingMode byok tampoco cobra", () => {
    expect(
      shouldChargeQuota({
        ownerId: "u", fleetAgentId: "f", groupId: "g",
        engine: getEngine("claude"), billingMode: "byok",
      })
    ).toBe(false);
  });
});
