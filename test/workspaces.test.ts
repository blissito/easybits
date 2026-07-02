import { describe, it, expect } from "vitest";
import { requireWorkspace } from "~/.server/apiAuth";
import type { AuthContext } from "~/.server/apiAuth";

const mockUser = { id: "user1", email: "test@test.com" } as any;

describe("requireWorkspace (scoped-key isolation)", () => {
  it("is a no-op for account-wide keys (no ctx.workspaceId)", () => {
    const ctx: AuthContext = { user: mockUser, scopes: ["ADMIN"] };
    expect(() => requireWorkspace(ctx, "wsA")).not.toThrow();
    expect(() => requireWorkspace(ctx, null)).not.toThrow();
    expect(() => requireWorkspace(ctx, undefined)).not.toThrow();
  });

  it("passes when the resource is in the key's workspace", () => {
    const ctx: AuthContext = { user: mockUser, scopes: ["WRITE"], workspaceId: "wsA" };
    expect(() => requireWorkspace(ctx, "wsA")).not.toThrow();
  });

  it("throws 404 (not 403) when the resource is in another workspace", () => {
    const ctx: AuthContext = { user: mockUser, scopes: ["WRITE"], workspaceId: "wsA" };
    try {
      requireWorkspace(ctx, "wsB");
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(404);
    }
  });

  it("throws 404 when a scoped key hits an account-level (null-workspace) resource", () => {
    const ctx: AuthContext = { user: mockUser, scopes: ["WRITE"], workspaceId: "wsA" };
    try {
      requireWorkspace(ctx, null);
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(404);
    }
  });
});
