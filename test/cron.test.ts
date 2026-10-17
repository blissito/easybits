import { describe, it, expect, vi, beforeEach } from "vitest";
import { data } from "react-router";

const db = vi.hoisted(() => ({
  cronJobState: { findUnique: vi.fn() },
  cronRun: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("~/.server/db", () => ({ db }));

import { CRON_JOBS, cronStatus, graceMs, nextRun, scheduleWords } from "~/lib/cronJobs";
import { readTrigger, summarize, withCronRun } from "~/.server/cron";

const at = (iso: string) => new Date(iso);

describe("scheduleWords", () => {
  it("pone el horario en palabras", () => {
    expect(scheduleWords("*/5 * * * *")).toBe("cada 5 min");
    expect(scheduleWords("0 3 * * *")).toBe("diario 03:00 UTC");
    expect(scheduleWords("30 3 * * *")).toBe("diario 03:30 UTC");
    expect(scheduleWords("0 6 * * 0")).toBe("domingos 06:00 UTC");
    expect(scheduleWords("0 6 1 * *")).toBe("0 6 1 * * (UTC)");
  });

  it("cada tarea de la tabla tiene ruta y cron válido", () => {
    for (const j of CRON_JOBS) {
      expect(j.path).toBe(`/api/cron/${j.key}`);
      expect(() => nextRun(j.cron)).not.toThrow();
    }
  });
});

describe("nextRun / graceMs", () => {
  it("la purga semanal cae en domingo, sin hueco a fin de mes", () => {
    // Viernes 30 de octubre de 2026 → domingo 1 de noviembre 06:00 UTC.
    expect(nextRun("0 6 * * 0", at("2026-10-30T12:00:00Z")).toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
  it("gracia = 10 % del periodo, mínimo 5 min", () => {
    expect(graceMs("*/5 * * * *")).toBe(5 * 60_000);
    expect(graceMs("0 3 * * *")).toBe(2.4 * 3600_000);
    expect(graceMs("0 6 * * 0")).toBe(16.8 * 3600_000);
  });
});

describe("cronStatus", () => {
  const daily = "0 3 * * *";
  const run = (startedAt: string, ok: boolean | null = true, finished = true) => ({
    startedAt: at(startedAt),
    finishedAt: finished ? at(startedAt) : null,
    ok,
  });

  it("pausado gana sobre todo", () => {
    expect(cronStatus(daily, run("2026-10-16T03:00:00Z", false), true, at("2026-10-16T04:00:00Z"))).toBe("pausado");
  });
  it("sin corridas = nuevo", () => {
    expect(cronStatus(daily, null, false)).toBe("nuevo");
  });
  it("al día antes de la siguiente hora programada", () => {
    expect(cronStatus(daily, run("2026-10-16T03:00:01Z"), false, at("2026-10-17T02:59:00Z"))).toBe("al-dia");
  });
  it("tarde dentro de la gracia, falló después", () => {
    const last = run("2026-10-16T03:00:01Z");
    expect(cronStatus(daily, last, false, at("2026-10-17T04:00:00Z"))).toBe("tarde");
    expect(cronStatus(daily, last, false, at("2026-10-17T05:30:00Z"))).toBe("fallo");
  });
  it("la última terminó con error = falló", () => {
    expect(cronStatus(daily, run("2026-10-16T03:00:01Z", false), false, at("2026-10-16T03:10:00Z"))).toBe("fallo");
  });
  it("corriendo = al día; corriendo hace más de una hora = falló (la app murió)", () => {
    const r = run("2026-10-16T03:00:01Z", null, false);
    expect(cronStatus(daily, r, false, at("2026-10-16T03:20:00Z"))).toBe("al-dia");
    expect(cronStatus(daily, r, false, at("2026-10-16T04:30:00Z"))).toBe("fallo");
  });
});

describe("readTrigger / summarize", () => {
  it("lee X-Cron-Trigger con github por default", () => {
    const req = (h?: string) => new Request("http://x", { headers: h ? { "X-Cron-Trigger": h } : {} });
    expect(readTrigger(req("restate"))).toBe("restate");
    expect(readTrigger(req("Manual"))).toBe("manual");
    expect(readTrigger(req("otro"))).toBe("github");
    expect(readTrigger(req())).toBe("github");
  });
  it("resume data() y Response en una línea", async () => {
    expect(await summarize(data({ purged: 3 }))).toEqual({ summary: '{"purged":3}', status: 200 });
    expect(await summarize(Response.json({ a: 1 }, { status: 207 }))).toEqual({ summary: '{"a":1}', status: 207 });
    const long = await summarize(data({ x: "y".repeat(1000) }));
    expect(long.summary!.length).toBe(300);
  });
});

describe("withCronRun", () => {
  const request = new Request("http://x/api/cron/purge-keys", { headers: { "X-Cron-Trigger": "restate" } });
  beforeEach(() => {
    vi.clearAllMocks();
    db.cronJobState.findUnique.mockResolvedValue(null);
    db.cronRun.create.mockResolvedValue({ id: "run1" });
    db.cronRun.update.mockResolvedValue({});
  });

  it("en pausa no corre y responde skipped", async () => {
    db.cronJobState.findUnique.mockResolvedValue({ paused: true });
    const fn = vi.fn();
    const res: any = await withCronRun("purge-keys", request, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(res.data).toEqual({ skipped: "paused" });
    expect(db.cronRun.create).not.toHaveBeenCalled();
  });

  it("registra inicio y final con resumen", async () => {
    const res: any = await withCronRun("purge-keys", request, async () => data({ purged: 2 }));
    expect(res.data).toEqual({ purged: 2 });
    expect(db.cronRun.create.mock.calls[0][0].data).toMatchObject({ job: "purge-keys", trigger: "restate" });
    const upd = db.cronRun.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "run1" });
    expect(upd.data).toMatchObject({ ok: true, status: 200, summary: '{"purged":2}' });
    expect(typeof upd.data.durationMs).toBe("number");
  });

  it("si el trabajo lanza, registra el error y relanza", async () => {
    await expect(
      withCronRun("purge-keys", request, async () => {
        throw new Error("Tigris caído");
      }),
    ).rejects.toThrow("Tigris caído");
    const upd = db.cronRun.update.mock.calls[0][0];
    expect(upd.data.ok).toBe(false);
    expect(upd.data.status).toBe(500);
    expect(upd.data.error).toContain("Tigris caído");
  });

  it("si la base no deja registrar, la tarea corre igual", async () => {
    db.cronRun.create.mockRejectedValue(new Error("mongo"));
    const res: any = await withCronRun("purge-keys", request, async () => data({ ok: 1 }));
    expect(res.data).toEqual({ ok: 1 });
    expect(db.cronRun.update).not.toHaveBeenCalled();
  });
});
