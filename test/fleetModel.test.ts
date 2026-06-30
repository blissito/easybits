import { describe, it, expect } from "vitest";
import { FLEET_DEFAULT_MODEL } from "~/.server/core/fleetAgentOperations";

// Fuente única del modelo de la flota: el worker corre sobre OAuth Max y el CLI
// honra ANTHROPIC_MODEL, inyectado en el env del spawn. Congela el default para
// que un cambio accidental sea visible.
describe("flota model lever", () => {
  it("defaults to claude-sonnet-5 (override via FLEET_MODEL env)", () => {
    // Sin FLEET_MODEL en el entorno de test → cae al default fijado.
    expect(FLEET_DEFAULT_MODEL).toBe(process.env.FLEET_MODEL || "claude-sonnet-5");
  });
});
