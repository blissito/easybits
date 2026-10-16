import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Cupo de cajas persistentes por plan (auditoría 12-oct-2026: un Byte creaba agentes ACP
// sin límite). Host falso: GET /v1/sandbox devuelve `boxes`; POST cuenta si se llegó a crear.
let server: http.Server;
let boxes: any[] = [];
let postHits = 0;
let mod: typeof import("~/.server/core/sandboxOperations");

const byte: any = { user: { id: "u1", email: "free@example.com", roles: [] }, scopes: ["READ", "WRITE"] };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/v1/sandbox")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(boxes));
      return;
    }
    if (req.method === "POST" && req.url === "/v1/sandbox") {
      postHits++;
      res.writeHead(503).end("stop here");
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  process.env.SANDBOX_HOST_URL = `http://127.0.0.1:${port}`;
  process.env.SANDBOX_HOST_TOKEN = "test-token";
  process.env.ADMIN_EMAILS = "admin@example.com";
  mod = await import("~/.server/core/sandboxOperations");
});

afterAll(() => {
  server.close();
});

const agent = (status: string, extra: Record<string, unknown> = {}) => ({
  sandboxId: `sb_${Math.random().toString(16).slice(2, 10)}`,
  name: "mi-agente",
  template: "ghosty-lite",
  status,
  metadata: {},
  ...extra,
});

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
}

describe("countsAgainstPlan", () => {
  it("cuenta vivas y dormidas, no máquinas ni destruidas", () => {
    expect(mod.countsAgainstPlan({ status: "suspended", metadata: {} } as any)).toBe(true);
    expect(mod.countsAgainstPlan({ status: "running", metadata: {} } as any)).toBe(true);
    expect(mod.countsAgainstPlan({ status: "running", metadata: { eb_tier: "micro" } } as any)).toBe(false);
    expect(mod.countsAgainstPlan({ status: "stopped", metadata: {} } as any)).toBe(false);
  });

  it("la caja de trabajo de una web app sin publicar no le quita lugar a los agentes", () => {
    expect(mod.countsAgainstPlan({ status: "suspended", metadata: { eb_work: "1" } } as any)).toBe(false);
    expect(mod.countsAsAgentBox({ status: "running", metadata: { eb_work: "1" } } as any)).toBe(false);
  });
});

describe("assertAccountBoxBudget", () => {
  it("Byte con 1 agente dormido: el segundo se rechaza con AgentLimitReached", async () => {
    boxes = [agent("suspended")];
    const e = await rejection(mod.assertAccountBoxBudget(byte));
    expect(e).toBeInstanceOf(Response);
    const r = e as Response;
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error).toBe("AgentLimitReached");
    expect(body.max).toBe(1);
    expect(body.message).toContain("Tu plan Byte incluye 1 agente y ya tienes «mi-agente»");
    expect(body.message).toContain("Mega: 2");
  });

  it("Byte vacío, o con sólo una máquina de hosting: pasa", async () => {
    boxes = [];
    await expect(mod.assertAccountBoxBudget(byte)).resolves.toBeUndefined();
    boxes = [agent("running", { metadata: { eb_tier: "micro" } })];
    await expect(mod.assertAccountBoxBudget(byte)).resolves.toBeUndefined();
  });

  it("revive: la caja que se reemplaza no cuenta", async () => {
    const own = agent("suspended");
    boxes = [own];
    await expect(mod.assertAccountBoxBudget(byte, { replacing: own.sandboxId })).resolves.toBeUndefined();
  });

  it("admin y courtesyHosting no tienen tope", async () => {
    boxes = [agent("running"), agent("running")];
    await expect(
      mod.assertAccountBoxBudget({ ...byte, user: { ...byte.user, email: "admin@example.com" } })
    ).resolves.toBeUndefined();
    await expect(
      mod.assertAccountBoxBudget({ ...byte, user: { ...byte.user, courtesyHosting: true } })
    ).resolves.toBeUndefined();
  });
});

describe("createSandbox persistente", () => {
  it("Byte lleno: ghosty-lite se rechaza ANTES de pedir la caja al host", async () => {
    boxes = [agent("suspended")];
    postHits = 0;
    const e = await rejection(mod.createSandbox(byte, { template: "ghosty-lite" as any }));
    expect(e).toBeInstanceOf(Response);
    expect((await (e as Response).json()).error).toBe("AgentLimitReached");
    expect(postHits).toBe(0);
  });

  it("persistent:true en un template genérico también cuenta", async () => {
    boxes = [agent("suspended")];
    postHits = 0;
    const e = await rejection(mod.createSandbox(byte, { template: "node" as any, persistent: true }));
    expect((await (e as Response).json()).error).toBe("AgentLimitReached");
    expect(postHits).toBe(0);
  });
});
