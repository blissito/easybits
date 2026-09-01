import { describe, it, expect, vi, beforeEach } from "vitest";

// Lo que estos tests sostienen: la superficie /bg es ADITIVA. Se añadió el
// listado y un alias POST del kill sin mover nada de lo que ya está publicado
// en dos posts y en el SDK compilado.

const calls: Array<{ method: string; path: string; body?: any }> = [];
vi.mock("~/.server/core/sandboxOperations", () => ({
  execBackground: vi.fn(async (_ctx: any, id: string, params: any) => {
    calls.push({ method: "start", path: id, body: params });
    return { execId: "bg_abc", status: "running" };
  }),
  execBackgroundList: vi.fn(async (_ctx: any, id: string) => {
    calls.push({ method: "list", path: id });
    return { count: 0, processes: [] };
  }),
  execBackgroundStatus: vi.fn(async (_ctx: any, id: string, execId: string) => {
    calls.push({ method: "status", path: `${id}/${execId}` });
    return { status: "running", stdout: "", stderr: "", startedAt: "now" };
  }),
  execBackgroundKill: vi.fn(async (_ctx: any, id: string, execId: string, opts?: any) => {
    calls.push({ method: "kill", path: `${id}/${execId}`, body: opts });
    return { ok: true };
  }),
}));

const rateLimit = vi.fn(async () => null as any);
vi.mock("~/.server/rateLimiter", () => ({
  applySandboxRateLimit: (...a: any[]) => rateLimit(...(a as [])),
}));

const ctx = { user: { id: "u1" }, apiKey: { id: "k1" }, scopes: ["WRITE"] };
vi.mock("~/.server/apiAuth", () => ({
  authenticateRequest: vi.fn(async () => ctx),
  requireAuth: vi.fn((c: any) => c),
}));

vi.mock("~/.server/compute/gateway", () => ({
  computeEnvFor: vi.fn(async () => ({})),
}));

const bg = await import("~/routes/api/v2/sandbox-bg");
const detail = await import("~/routes/api/v2/sandbox-bg-detail");
const killAlias = await import("~/routes/api/v2/sandbox-bg-kill");

const req = (url: string, method = "GET") => new Request(url, { method });

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  rateLimit.mockResolvedValue(null as any);
});

describe("GET /api/v2/sandboxes/:id/bg — listado (nuevo)", () => {
  it("lista los procesos de la caja", async () => {
    const res: any = await bg.loader({
      request: req("https://x/api/v2/sandboxes/sb_1/bg"),
      params: { id: "sb_1" },
    } as any);
    expect(await res.json()).toEqual({ count: 0, processes: [] });
    expect(calls).toEqual([{ method: "list", path: "sb_1" }]);
  });

  it("usa el bucket de rate limit 'op', como el resto de /bg", async () => {
    await bg.loader({
      request: req("https://x/api/v2/sandboxes/sb_1/bg"),
      params: { id: "sb_1" },
    } as any);
    expect(rateLimit).toHaveBeenCalledWith("k1", "op");
  });

  it("respeta el rate limiter: si corta, no llega a la caja", async () => {
    rateLimit.mockResolvedValue(new Response("slow down", { status: 429 }) as any);
    const res: any = await bg.loader({
      request: req("https://x/api/v2/sandboxes/sb_1/bg"),
      params: { id: "sb_1" },
    } as any);
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(0);
  });
});

describe("kill — el DELETE publicado y el alias POST de los docs", () => {
  it("DELETE .../bg/:execId sigue funcionando igual (contrato publicado)", async () => {
    const res: any = await detail.action({
      request: req("https://x/api/v2/sandboxes/sb_1/bg/bg_abc", "DELETE"),
      params: { id: "sb_1", execId: "bg_abc" },
    } as any);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: "kill", path: "sb_1/bg_abc" });
  });

  it("POST .../bg/:execId/kill — la ruta que los docs prometían — llega a la misma op", async () => {
    const res: any = await killAlias.action({
      request: req("https://x/api/v2/sandboxes/sb_1/bg/bg_abc/kill", "POST"),
      params: { id: "sb_1", execId: "bg_abc" },
    } as any);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: "kill", path: "sb_1/bg_abc" });
  });

  it("graceSeconds viaja hasta la op", async () => {
    await killAlias.action({
      request: req("https://x/api/v2/sandboxes/sb_1/bg/bg_abc/kill?graceSeconds=0", "POST"),
      params: { id: "sb_1", execId: "bg_abc" },
    } as any);
    expect(calls[0].body).toEqual({ graceSeconds: 0 });
  });

  it("sin graceSeconds no se inventa un valor (gana el default del agente)", async () => {
    await detail.action({
      request: req("https://x/api/v2/sandboxes/sb_1/bg/bg_abc", "DELETE"),
      params: { id: "sb_1", execId: "bg_abc" },
    } as any);
    expect(calls[0].body).toEqual({ graceSeconds: undefined });
  });

  it("un método que no es POST ni DELETE sigue dando 405", async () => {
    for (const [mod, method] of [
      [detail, "PUT"],
      [killAlias, "GET"],
    ] as const) {
      const res: any = await (mod as any).action({
        request: req("https://x/api/v2/sandboxes/sb_1/bg/bg_abc", method),
        params: { id: "sb_1", execId: "bg_abc" },
      } as any);
      expect(res.status).toBe(405);
    }
  });
});

describe("POST /api/v2/sandboxes/:id/bg — arranque (sin cambios)", () => {
  it("exige command", async () => {
    const res: any = await bg.action({
      request: new Request("https://x/api/v2/sandboxes/sb_1/bg", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      params: { id: "sb_1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("devuelve el execId tal cual lo espera el ejemplo publicado", async () => {
    const res: any = await bg.action({
      request: new Request("https://x/api/v2/sandboxes/sb_1/bg", {
        method: "POST",
        body: JSON.stringify({ command: "npm test", cwd: "/app" }),
      }),
      params: { id: "sb_1" },
    } as any);
    const out = await res.json();
    expect(out.execId).toBe("bg_abc");
    expect(out.status).toBe("running");
    expect(calls[0].body).toMatchObject({ command: "npm test", cwd: "/app" });
  });
});
