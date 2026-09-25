import { describe, it, expect } from "vitest";
import { FIRST_PARTY_CLIENTS, isRedirectAllowed } from "~/.server/oauthClients";

// El CLI `easybits` usa un redirect loopback con puerto al azar (RFC 8252 §7.3). Todo lo
// que NO sea exactamente eso tiene que seguir rechazándose: un match laxo es un open-redirect.
describe("isRedirectAllowed", () => {
  const cli = FIRST_PARTY_CLIENTS["easybits-cli"].redirectUris;

  it("acepta 127.0.0.1 y [::1] con cualquier puerto en /cb", () => {
    expect(isRedirectAllowed(cli, "http://127.0.0.1:50602/cb")).toBe(true);
    expect(isRedirectAllowed(cli, "http://127.0.0.1:1/cb")).toBe(true);
    expect(isRedirectAllowed(cli, "http://[::1]:8080/cb")).toBe(true);
  });

  it("rechaza otro host, otro path, https, query o credenciales", () => {
    for (const bad of [
      "http://localhost:50602/cb",
      "http://127.0.0.2:50602/cb",
      "http://evil.com:50602/cb",
      "http://127.0.0.1:50602/cb/extra",
      "http://127.0.0.1:50602/",
      "https://127.0.0.1:50602/cb",
      "http://127.0.0.1:50602/cb?next=https://evil.com",
      "http://127.0.0.1:50602/cb#x",
      "http://user:pw@127.0.0.1:50602/cb",
      "not a url",
      "",
    ]) {
      expect(isRedirectAllowed(cli, bad), bad).toBe(false);
    }
  });

  it("los clientes con redirect exacto (MCP por DCR) siguen igual", () => {
    const dcr = ["http://127.0.0.1:33418/callback", "https://claude.ai/api/mcp/auth_callback"];
    expect(isRedirectAllowed(dcr, "http://127.0.0.1:33418/callback")).toBe(true);
    expect(isRedirectAllowed(dcr, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    // Sin `*` registrado no hay comodín de puerto.
    expect(isRedirectAllowed(dcr, "http://127.0.0.1:40000/callback")).toBe(false);
  });
});
