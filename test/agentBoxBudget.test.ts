import { describe, it, expect } from "vitest";
import { countsAsAgentBox } from "~/.server/core/sandboxOperations";

// Una máquina de hosting vendida (`eb_tier`) se cobra aparte y NO ocupa cupo de
// cajas de agente. Antes un Mega con su micro quedaba en 1 de 2.
describe("countsAsAgentBox", () => {
  it("cuenta las cajas activas de agente", () => {
    expect(countsAsAgentBox({ status: "running" })).toBe(true);
    expect(countsAsAgentBox({ status: "starting", metadata: {} })).toBe(true);
  });
  it("no cuenta máquinas de hosting aunque estén corriendo", () => {
    expect(countsAsAgentBox({ status: "running", metadata: { eb_tier: "micro" } })).toBe(false);
  });
  it("no cuenta cajas dormidas o muertas", () => {
    expect(countsAsAgentBox({ status: "suspended" })).toBe(false);
    expect(countsAsAgentBox({ status: "lost" })).toBe(false);
  });
});
