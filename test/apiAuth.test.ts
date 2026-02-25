import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth, requireScope } from "~/.server/apiAuth";
import type { AuthContext } from "~/.server/apiAuth";

describe("apiAuth", () => {
  const mockUser = { id: "user1", email: "test@test.com" } as any;

  describe("requireAuth", () => {
    it("throws 401 for null context", () => {
      expect(() => requireAuth(null)).toThrow();
      try {
        requireAuth(null);
      } catch (e: any) {
        expect(e.status).toBe(401);
      }
    });

    it("returns context when valid", () => {
      const ctx: AuthContext = { user: mockUser, scopes: ["READ"] };
      expect(requireAuth(ctx)).toBe(ctx);
    });
  });

  describe("requireScope", () => {
    it("throws 403 when scope missing", () => {
      const ctx: AuthContext = { user: mockUser, scopes: ["READ"] };
      try {
        requireScope(ctx, "DELETE");
        expect.unreachable();
      } catch (e: any) {
        expect(e.status).toBe(403);
      }
    });

    it("passes with ADMIN scope", () => {
      const ctx: AuthContext = { user: mockUser, scopes: ["ADMIN"] };
      expect(() => requireScope(ctx, "DELETE")).not.toThrow();
    });

    it("passes with matching scope", () => {
      const ctx: AuthContext = { user: mockUser, scopes: ["READ", "WRITE"] };
      expect(() => requireScope(ctx, "WRITE")).not.toThrow();
    });
  });
});
