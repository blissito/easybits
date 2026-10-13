import { describe, expect, it } from "vitest";
import { isRedirectAllowed } from "~/.server/oauthClients";

// Claude Code registra su loopback con el puerto de ese arranque y vuelve con otro.
describe("isRedirectAllowed", () => {
  const dcr = ["https://claude.ai/api/mcp/auth_callback", "http://localhost:53123/callback"];

  it("exacto para https", () => {
    expect(isRedirectAllowed(dcr, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isRedirectAllowed(dcr, "https://claude.ai/api/mcp/auth_callback/x")).toBe(false);
  });

  it("loopback con cualquier puerto, mismo host y path", () => {
    expect(isRedirectAllowed(dcr, "http://localhost:61111/callback")).toBe(true);
    expect(isRedirectAllowed(dcr, "http://localhost:61111/otro")).toBe(false);
    expect(isRedirectAllowed(dcr, "http://127.0.0.1:61111/callback")).toBe(false);
    expect(isRedirectAllowed(dcr, "http://localhost:61111/callback?x=1")).toBe(false);
    expect(isRedirectAllowed(dcr, "http://evil.example:53123/callback")).toBe(false);
  });

  it("el comodín del CLI de casa sigue valiendo", () => {
    expect(isRedirectAllowed(["http://127.0.0.1:*/cb"], "http://127.0.0.1:4000/cb")).toBe(true);
  });
});
