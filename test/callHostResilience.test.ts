import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// callHost lee HOST_URL/HOST_TOKEN a nivel de módulo → hay que fijar el env
// ANTES de importar sandboxOperations (import dinámico en beforeAll).
let server: http.Server;
let getHits = 0;
let postHits = 0;
let mod: typeof import("~/.server/core/sandboxOperations");

const ctx: any = {
  user: { id: "u1" },
  scopes: ["READ", "WRITE", "DELETE", "ADMIN"],
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/v1/sandbox")) {
      getHits++;
      // 503 las primeras 2 veces, 200 a la 3ª → debe reintentar y resolver.
      if (getHits < 3) {
        res.writeHead(503).end("upstream down");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
      }
      return;
    }
    if (req.method === "POST" && req.url === "/v1/sandbox") {
      postHits++;
      res.writeHead(503).end("upstream down"); // siempre 503
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  process.env.SANDBOX_HOST_URL = `http://127.0.0.1:${port}`;
  process.env.SANDBOX_HOST_TOKEN = "test-token";
  mod = await import("~/.server/core/sandboxOperations");
});

afterAll(() => {
  server.close();
});

describe("callHost resilience", () => {
  it("GET reintenta ante 503 y resuelve (idempotente)", async () => {
    getHits = 0;
    const result = await mod.listSandboxes(ctx); // GET /v1/sandbox
    expect(result).toEqual([]);
    expect(getHits, "debió pegar 3 veces: 503, 503, 200").toBe(3);
  });

  it("POST NO reintenta ante 503 (evita doble-spawn)", async () => {
    postHits = 0;
    await expect(
      mod.createSandbox(ctx, { template: "python" as any })
    ).rejects.toThrow(/503/);
    expect(postHits, "POST debió pegar exactamente 1 vez").toBe(1);
  });
});
