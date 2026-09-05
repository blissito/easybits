import { describe, it, expect } from "vitest";
import { hasFleetScope, isFleetToken, isPublishable, generateFleetToken } from "~/.server/core/fleetTokens";
import { isAdminCapabilityAction } from "~/.server/core/fleetCapabilityActions";

// La razón de existir de estos scopes: `fleetAgent.token` servía para mandar mensajes
// Y para borrar el agente, así que embeber un widget obligaba a entregar el control
// total. Estos tests fijan la escalera para que no se afloje por accidente.
describe("fleet token scopes", () => {
  it("ADMIN implica todo", () => {
    expect(hasFleetScope(["ADMIN"], "MESSAGE")).toBe(true);
    expect(hasFleetScope(["ADMIN"], "MANAGE")).toBe(true);
    expect(hasFleetScope(["ADMIN"], "ADMIN")).toBe(true);
  });

  it("MANAGE puede mensajear pero NO administrar", () => {
    expect(hasFleetScope(["MANAGE"], "MESSAGE")).toBe(true);
    expect(hasFleetScope(["MANAGE"], "MANAGE")).toBe(true);
    expect(hasFleetScope(["MANAGE"], "ADMIN")).toBe(false);
  });

  it("MESSAGE sólo mensajea — no configura ni administra", () => {
    expect(hasFleetScope(["MESSAGE"], "MESSAGE")).toBe(true);
    expect(hasFleetScope(["MESSAGE"], "MANAGE")).toBe(false);
    expect(hasFleetScope(["MESSAGE"], "ADMIN")).toBe(false);
  });
});

describe("prefijos de token", () => {
  it("distingue publishable de secreto", () => {
    const pk = generateFleetToken(true);
    const sk = generateFleetToken(false);
    expect(pk.raw.startsWith("flt_pk_")).toBe(true);
    expect(sk.raw.startsWith("flt_sk_")).toBe(true);
    expect(isPublishable(pk.raw)).toBe(true);
    expect(isPublishable(sk.raw)).toBe(false);
    expect(isFleetToken(pk.raw) && isFleetToken(sk.raw)).toBe(true);
  });

  it("no confunde un token legacy ni una API key de cuenta con uno de flota", () => {
    expect(isFleetToken("eb_sk_live_abc")).toBe(false);
    expect(isFleetToken("algún-token-legacy")).toBe(false);
  });

  it("nunca guarda el token en claro (hash != raw) y el prefijo no lo revela", () => {
    const { raw, hashed, prefix } = generateFleetToken(false);
    expect(hashed).not.toContain(raw);
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(raw.length);
  });
});

describe("acciones de capabilities que exigen ADMIN", () => {
  it("las que tocan credenciales o destruyen son ADMIN", () => {
    for (const a of ["set-secret", "add-mcp", "remove-mcp", "delete-skill", "set-engine", "recycle-box"]) {
      expect(isAdminCapabilityAction(a)).toBe(true);
    }
  });

  it("la configuración de rutina es MANAGE", () => {
    for (const a of ["set-prompt", "set-model", "set-effort", "set-cap-level", "toggle-builtin", "set-toolgroup"]) {
      expect(isAdminCapabilityAction(a)).toBe(false);
    }
  });
});

// Regresión: un token recién creado NO escribe `revokedAt`, así que en Mongo el campo
// queda AUSENTE. Prisma no matchea un campo ausente con `null` ni con `{ not: ... }`
// (sólo con `{ isSet: false }`), así que filtrar por `revokedAt: null` devolvía la
// lista SIEMPRE vacía — el dueño no veía ninguna de sus credenciales.
describe("filtro de tokens vivos (Prisma + Mongo)", () => {
  it("el filtro contempla el campo ausente, no sólo null", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../app/.server/core/fleetTokens.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("isSet: false");
    // Y nunca el filtro ingenuo, que es el que fallaba.
    expect(src).not.toMatch(/where:\s*\{\s*fleetAgentId,\s*revokedAt:\s*null\s*\}/);
  });
});
