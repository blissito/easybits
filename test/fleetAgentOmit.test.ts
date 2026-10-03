import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DB_OPTIONS } from "~/.server/db";

// Incidente 2026-10-03: filas FleetAgent de 1.4 MB (llaves de Baileys) hacían que
// cada request de la flota tardara 15 s. Este test impide quitar el omit sin querer.
describe("FleetAgent omite el estado de Baileys por default", () => {
  it("authCreds y authKeys quedan fuera del cliente", () => {
    expect(DB_OPTIONS.omit.fleetAgent).toEqual({ authCreds: true, authKeys: true });
  });

  it("baileys pide authCreds explícito y las llaves salen de su colección", () => {
    const src = readFileSync("app/.server/integrations/whatsapp/baileys.server.ts", "utf8");
    expect(src).toMatch(/select:\s*\{\s*authCreds:\s*true\s*\}/);
    expect(src).toMatch(/createKeyStore\(/);
  });
});
