import { describe, it, expect, vi, beforeEach } from "vitest";

// Monitor de cambios: línea base sin aviso, aviso con diff cuando cambia, nada cuando sólo
// cambian contadores, pausa sin consultas, y una sola revisión por turno.

const db = vi.hoisted(() => ({
  webJob: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
const blobs = vi.hoisted(() => new Map<string, string>());
const store = vi.hoisted(() => ({
  putObject: vi.fn(async (k: string, b: Buffer) => void blobs.set(k, b.toString("utf8"))),
  getReadUrl: vi.fn(async (k: string) => `https://bucket.test/${k}`),
  deleteObject: vi.fn(async (k: string) => void blobs.delete(k)),
}));
const quota = vi.hoisted(() => ({ checkWebQuota: vi.fn(), chargeWebQueries: vi.fn() }));
const dispatchWebhooks = vi.hoisted(() => vi.fn());

vi.mock("../app/.server/db", () => ({ db }));
vi.mock("../app/.server/storage", () => ({ getPlatformDefaultClient: () => store }));
vi.mock("../app/.server/webQuota", () => quota);
vi.mock("../app/.server/webhooks", () => ({ dispatchWebhooks }));

import { checkMonitor, createMonitor, lineDiff, normalizeForCompare, type MonitorMeta } from "../app/.server/core/webMonitors";

const ME = "a".repeat(24);
const MON = "d".repeat(24);
let pageBody = "";
let row: { id: string; userId: string; status: string; meta: MonitorMeta; nextRunAt: Date | null };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.BRIGHTDATA_API_TOKEN = "t";
  blobs.clear();
  for (const f of Object.values(db.webJob)) f.mockReset();
  quota.checkWebQuota.mockReset().mockResolvedValue({ available: 100 });
  quota.chargeWebQueries.mockReset();
  dispatchWebhooks.mockReset();
  row = { id: MON, userId: ME, status: "running", meta: { url: "https://ej.test/precios", everyMinutes: 60, checks: 0, changes: 0 }, nextRunAt: new Date(0) };
  db.webJob.findUnique.mockImplementation(async () => structuredClone(row));
  db.webJob.updateMany.mockImplementation(async ({ data }: any) => {
    row = { ...row, ...data };
    return { count: 1 };
  });
  db.webJob.update.mockImplementation(async ({ data }: any) => {
    row = { ...row, ...data, meta: data.meta ?? row.meta };
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
    const target = String(u);
    if (target.startsWith("https://bucket.test/")) {
      const b = blobs.get(target.slice("https://bucket.test/".length));
      return b === undefined ? new Response("", { status: 404 }) : new Response(b);
    }
    return pageBody === "CAIDA" ? Response.json({ status_code: 503, headers: {}, body: "" }) : Response.json({ status_code: 200, body: pageBody });
  });
});

describe("normalizeForCompare / lineDiff", () => {
  it("ignora contadores, fechas sueltas y «hace N minutos», pero no palabras normales", () => {
    const n = normalizeForCompare("Plan Byte  $199\n12:34\n22/10/2026\nhace 3 minutos\n5 min ago\nmas\nhome");
    expect(n).toBe("Plan Byte $199\nmas\nhome");
  });
  it("reporta líneas agregadas y quitadas", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toMatchObject({ added: ["d"], removed: ["b"], totalAdded: 1, totalRemoved: 1 });
  });
});

describe("checkMonitor", () => {
  it("la primera revisión sólo guarda la línea base (sin aviso) y cobra 1", async () => {
    pageBody = "# Precios\nByte $199";
    expect(await checkMonitor(MON)).toEqual({ checked: true, changed: false });
    expect(dispatchWebhooks).not.toHaveBeenCalled();
    expect(quota.chargeWebQueries).toHaveBeenCalledWith(ME, expect.objectContaining({ cost: 1, resourceId: MON }));
    expect(row.meta.checks).toBe(1);
    expect(row.meta.hash).toBeTruthy();
  });

  it("si cambia, avisa web.page.changed con lo agregado y lo quitado", async () => {
    pageBody = "# Precios\nByte $199";
    await checkMonitor(MON);
    row.nextRunAt = new Date(0);
    pageBody = "# Precios\nByte $249";
    expect(await checkMonitor(MON)).toEqual({ checked: true, changed: true });
    expect(dispatchWebhooks).toHaveBeenCalledWith(
      ME,
      "web.page.changed",
      expect.objectContaining({ monitorId: MON, url: "https://ej.test/precios", added: ["Byte $249"], removed: ["Byte $199"] }),
    );
    expect(row.meta.changes).toBe(1);
  });

  it("si sólo cambian contadores u horas, no avisa", async () => {
    pageBody = "# Precios\nByte $199\nhace 2 minutos";
    await checkMonitor(MON);
    row.nextRunAt = new Date(0);
    pageBody = "# Precios\nByte $199\nhace 9 minutos";
    expect(await checkMonitor(MON)).toEqual({ checked: true, changed: false });
    expect(dispatchWebhooks).not.toHaveBeenCalled();
  });

  it("agenda la siguiente revisión ANTES de salir a internet; si otra pasada la tomó, no revisa", async () => {
    pageBody = "x";
    db.webJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await checkMonitor(MON)).toEqual({ checked: false });
    expect(quota.chargeWebQueries).not.toHaveBeenCalled();
  });

  it("página caída: no cobra ni avisa, reintenta en el siguiente turno", async () => {
    pageBody = "CAIDA";
    expect(await checkMonitor(MON)).toMatchObject({ checked: false, failed: true });
    expect(quota.chargeWebQueries).not.toHaveBeenCalled();
  });

  it("sin consultas se pausa y avisa web.monitor.paused", async () => {
    quota.checkWebQuota.mockResolvedValue({ available: 0 });
    expect(await checkMonitor(MON)).toMatchObject({ paused: true });
    expect(row.status).toBe("error");
    expect(dispatchWebhooks).toHaveBeenCalledWith(ME, "web.monitor.paused", expect.objectContaining({ monitorId: MON }));
  });
});

describe("createMonitor", () => {
  it("acota everyMinutes a 15..10080 y la primera revisión queda para ya", async () => {
    db.webJob.count.mockResolvedValue(0);
    db.webJob.create.mockImplementation(async ({ data }: any) => ({ id: MON, error: null, createdAt: new Date(), ...data }));
    const m = await createMonitor(ME, { url: "https://ej.test/x", everyMinutes: 1 });
    expect(m).toMatchObject({ monitorId: MON, everyMinutes: 15, status: "active", checks: 0 });
  });
  it("tope de 50 activos por cuenta", async () => {
    db.webJob.count.mockResolvedValue(50);
    await expect(createMonitor(ME, { url: "https://ej.test/x" })).rejects.toThrow(/Máximo 50/);
  });
});
