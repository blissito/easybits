import { describe, it, expect } from "vitest";
import {
  checkSandboxRateLimit,
  applySandboxRateLimit,
} from "~/.server/rateLimiter";

// Cada test usa un identificador único para no chocar con el cache global
// (in-memory LRU compartido, ventana de 60s).
let n = 0;
const uid = (label: string) => `test-${label}-${n++}-${Math.round(performance.now())}`;

describe("checkSandboxRateLimit", () => {
  it("permite hasta 10 'create' y bloquea el 11º", async () => {
    const id = uid("create-cap");
    for (let i = 1; i <= 10; i++) {
      const rl = await checkSandboxRateLimit(id, "create");
      expect(rl.allowed, `create #${i} debe pasar`).toBe(true);
    }
    const rl11 = await checkSandboxRateLimit(id, "create");
    expect(rl11.allowed, "create #11 debe bloquearse").toBe(false);
    expect(rl11.max).toBe(10);
    expect(rl11.retryAfterS).toBe(60);
  });

  it("permite hasta 120 'op' y bloquea el 121º", async () => {
    const id = uid("op-cap");
    for (let i = 1; i <= 120; i++) {
      const rl = await checkSandboxRateLimit(id, "op");
      expect(rl.allowed, `op #${i} debe pasar`).toBe(true);
    }
    const rl121 = await checkSandboxRateLimit(id, "op");
    expect(rl121.allowed, "op #121 debe bloquearse").toBe(false);
    expect(rl121.max).toBe(120);
  });

  it("buckets 'create' y 'op' son independientes (fix de namespacing)", async () => {
    const id = uid("independent");
    // Agotar create (10) por completo.
    for (let i = 0; i < 10; i++) await checkSandboxRateLimit(id, "create");
    const createBlocked = await checkSandboxRateLimit(id, "create");
    expect(createBlocked.allowed, "create agotado").toBe(false);
    // op con el MISMO identificador debe seguir libre — bucket separado.
    const op = await checkSandboxRateLimit(id, "op");
    expect(op.allowed, "op no debe verse afectado por create agotado").toBe(true);
    expect(op.remaining).toBeGreaterThan(100);
  });

  it("identificadores distintos no se interfieren", async () => {
    const a = uid("iso-a");
    const b = uid("iso-b");
    for (let i = 0; i < 10; i++) await checkSandboxRateLimit(a, "create");
    expect((await checkSandboxRateLimit(a, "create")).allowed).toBe(false);
    expect((await checkSandboxRateLimit(b, "create")).allowed).toBe(true);
  });
});

describe("applySandboxRateLimit (adaptador REST)", () => {
  it("devuelve null mientras hay presupuesto", async () => {
    const id = uid("rest-ok");
    const res = await applySandboxRateLimit(id, "op");
    expect(res).toBeNull();
  });

  it("devuelve 429 con Retry-After y headers al exceder", async () => {
    const id = uid("rest-429");
    for (let i = 0; i < 10; i++) await applySandboxRateLimit(id, "create");
    const blocked = await applySandboxRateLimit(id, "create");
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBe("60");
    expect(blocked!.headers.get("X-RateLimit-Limit")).toBe("10");
    const body = await blocked!.json();
    expect(body.error).toBe("Rate limit exceeded");
  });
});
