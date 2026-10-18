import { describe, it, expect, vi, beforeEach } from "vitest";

// `wait`: espera la siguiente corrida que TERMINE; `notify`: cuándo y qué se avisa.
let runs: any[] = [];
let cron: any = null;
const match = (r: any, where: any) =>
  r.job === where.job &&
  (!where.startedAt?.gte || r.startedAt >= where.startedAt.gte) &&
  (!where.startedAt?.gt || r.startedAt > where.startedAt.gt) &&
  (where.finishedAt?.isSet === undefined || !!r.finishedAt === where.finishedAt.isSet);
const mockDb = {
  userCron: {
    findFirst: vi.fn(async () => cron),
    findUnique: vi.fn(async () => cron),
  },
  cronRun: {
    findFirst: vi.fn(async ({ where }: any) => runs.filter((r) => match(r, where)).sort((a, b) => a.startedAt - b.startedAt)[0] ?? null),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

const { waitUserCronRun, shouldNotify, notifyText } = await import("~/.server/core/userCronOperations");

const ID = "6a00000000000000000000aa";
const ctx = { user: { id: "u1" }, scopes: ["READ"] } as any;
const run = (startedAt: Date, finishedAt: Date | null, extra = {}) => ({
  id: `r${runs.length}`, job: `user:${ID}`, trigger: "schedule", startedAt, finishedAt, ok: true, status: null, durationMs: 1, summary: "exit 0", error: null, exitCode: 0, logs: "hola", ...extra,
});

beforeEach(() => {
  runs = [];
  cron = { id: ID, ownerId: "u1", timezone: "America/Mexico_City", enabled: true, nextRunAt: new Date(Date.now() + 60_000), updatedAt: new Date(Date.now() - 3_600_000) };
});

describe("wait", () => {
  it("regresa la corrida que termina mientras espera, con logs", async () => {
    let calls = 0;
    const r = await waitUserCronRun(ctx, ID, {
      waitS: 50,
      sleep: async () => {
        if (++calls === 2) runs.push(run(new Date(Date.now() + 1000), new Date(Date.now() + 2000)));
      },
    });
    expect(r.run).toMatchObject({ exitCode: 0, logs: "hola" });
  });
  it("toma la corrida en curso aunque haya empezado antes de llamar", async () => {
    const started = new Date(Date.now() - 5000);
    runs.push(run(started, null));
    const r = await waitUserCronRun(ctx, ID, { waitS: 50, sleep: async () => { runs[0].finishedAt = new Date(); } });
    expect(r.after).toBe(started.toISOString());
    expect(r.run?.id).toBe("r0");
  });
  it("una corrida vieja ya terminada no cuenta", async () => {
    runs.push(run(new Date(Date.now() - 60_000), new Date(Date.now() - 59_000)));
    const r = await waitUserCronRun(ctx, ID, { waitS: 0 });
    expect(r.run).toBeNull();
    expect(r.nextRunAt).not.toBeNull();
  });
  it("recién reclamado (apagado, sin corrida todavía) sigue esperando en lugar de dar 409", async () => {
    cron = { ...cron, enabled: false, nextRunAt: null, updatedAt: new Date(Date.now() - 1000) };
    let calls = 0;
    const r = await waitUserCronRun(ctx, ID, {
      waitS: 50,
      sleep: async () => {
        if (++calls === 1) runs.push(run(new Date(Date.now() + 500), new Date(Date.now() + 1500)));
      },
    });
    expect(r.run?.id).toBe("r0");
  });
  it("sin nada que esperar → 409 al instante", async () => {
    cron = { ...cron, enabled: false, nextRunAt: null };
    await expect(waitUserCronRun(ctx, ID, { waitS: 50 })).rejects.toMatchObject({ status: 409 });
  });
});

describe("notify", () => {
  it("failure sólo avisa si falla; always siempre; sin notify nunca", () => {
    expect(shouldNotify({ on: "failure", push: { secret: "X" } }, true)).toBe(false);
    expect(shouldNotify({ on: "failure", push: { secret: "X" } }, false)).toBe(true);
    expect(shouldNotify({ on: "always", email: true }, true)).toBe(true);
    expect(shouldNotify(null, false)).toBe(false);
  });
  it("texto corto con el resultado", () => {
    expect(notifyText("Revisión 1.0.10", { ok: true, exitCode: 0, summary: "exit 0 · enviada", error: null })).toEqual({
      title: "✅ «Revisión 1.0.10» terminó bien",
      body: "exit 0 · enviada",
    });
    expect(notifyText("X", { ok: false, exitCode: 1, summary: null, error: "exit 1: boom" }).title).toContain("❌");
  });
});
