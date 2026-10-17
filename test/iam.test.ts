import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateApiKey, hasScope, mintableScopes } from "~/.server/iam";

describe("iam", () => {
  describe("generateApiKey", () => {
    it("generates a key with correct format", () => {
      const { raw, prefix, hashed } = generateApiKey();
      expect(raw).toMatch(/^eb_sk_live_/);
      expect(raw.length).toBeGreaterThan(30);
      expect(prefix).toBe(raw.slice(0, 19));
      expect(hashed).toHaveLength(64); // sha256 hex
    });

    it("generates unique keys", () => {
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a.raw).not.toBe(b.raw);
      expect(a.hashed).not.toBe(b.hashed);
    });
  });

  describe("hasScope", () => {
    it("ADMIN implies all scopes", () => {
      expect(hasScope(["ADMIN"], "READ")).toBe(true);
      expect(hasScope(["ADMIN"], "WRITE")).toBe(true);
      expect(hasScope(["ADMIN"], "DELETE")).toBe(true);
    });

    it("checks specific scopes", () => {
      expect(hasScope(["READ"], "READ")).toBe(true);
      expect(hasScope(["READ"], "WRITE")).toBe(false);
      expect(hasScope(["READ", "WRITE"], "WRITE")).toBe(true);
    });
  });

  describe("mintableScopes", () => {
    it("sin scopes pedidos = READ/WRITE/DELETE (lo que usa el SSO con su token OAuth)", () => {
      expect(mintableScopes(["READ", "WRITE", "DELETE"], undefined)).toEqual({ scopes: ["READ", "WRITE", "DELETE"] });
    });

    it("una key nunca fabrica otra con más permisos", () => {
      expect(mintableScopes(["READ"], ["READ", "WRITE"])).toEqual({ error: expect.stringMatching(/cannot grant: WRITE/) });
      expect(mintableScopes(["READ", "WRITE", "DELETE"], ["ADMIN"])).toEqual({ error: expect.stringMatching(/ADMIN/) });
      expect(mintableScopes(["READ"], undefined)).toHaveProperty("error");
    });

    it("ADMIN (sesión del panel) puede todo; scopes repetidos se dedupean", () => {
      expect(mintableScopes(["ADMIN"], ["ADMIN", "READ", "READ"])).toEqual({ scopes: ["ADMIN", "READ"] });
    });

    it("rechaza scopes desconocidos o lista vacía", () => {
      expect(mintableScopes(["ADMIN"], ["OWNER"])).toEqual({ error: expect.stringMatching(/unknown scope/) });
      expect(mintableScopes(["ADMIN"], [])).toHaveProperty("error");
      expect(mintableScopes(["ADMIN"], "READ")).toHaveProperty("error");
    });
  });
});
