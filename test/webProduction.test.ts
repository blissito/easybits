import { describe, it, expect, vi, beforeEach } from "vitest";

// Lo que hace al toolset web vendible «para producción»: ningún corte mudo, aviso por
// webhook al terminar un extract (una sola vez) y un canario que avisa a la 2.ª falla.

const db = vi.hoisted(() => ({
  webJob: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  appConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const store = vi.hoisted(() => ({
  putObject: vi.fn(),
  getReadUrl: vi.fn(async (k: string) => `https://bucket.test/${k}`),
  deleteObject: vi.fn(),
}));
const dispatchWebhooks = vi.hoisted(() => vi.fn());
const sendTransactional = vi.hoisted(() => vi.fn());

vi.mock("../app/.server/db", () => ({ db }));
vi.mock("../app/.server/storage", () => ({ getPlatformDefaultClient: () => store }));
vi.mock("../app/.server/webhooks", () => ({ dispatchWebhooks }));
vi.mock("../app/.server/emails/sendTransactional", () => ({ sendTransactional }));

import {
  brightdataScrapeService,
  sliceFetchBody,
  SCRAPE_BODY_MAX_LEN,
} from "../app/.server/services/providers/brightdata";
import fs from "node:fs";
import path from "node:path";
import { probeWebProvider } from "../app/.server/services/providers/brightdata";
import { canaryStatus, EXTRACT_GIVE_UP_MS, runWebCanary, sweepWebJobs } from "../app/.server/core/webJobsOperations";

const ME = "a".repeat(24);
const JOB = "b".repeat(24);

beforeEach(() => {
  vi.restoreAllMocks();
  for (const g of [db.webJob, db.appConfig]) for (const f of Object.values(g)) f.mockReset();
  store.putObject.mockReset();
  store.deleteObject.mockReset();
  dispatchWebhooks.mockReset();
  sendTransactional.mockReset();
  process.env.BRIGHTDATA_API_TOKEN = "t";
  process.env.ADMIN_EMAILS = "ops@test";
});

describe("sliceFetchBody", () => {
  it("declara el corte y dónde sigue", () => {
    const full = "x".repeat(SCRAPE_BODY_MAX_LEN * 2 + 10);
    const a = sliceFetchBody(full);
    expect(a).toMatchObject({ offset: 0, length: full.length, truncated: true, nextOffset: SCRAPE_BODY_MAX_LEN });
    const c = sliceFetchBody(full, SCRAPE_BODY_MAX_LEN * 2);
    expect(c).toMatchObject({ truncated: false, nextOffset: undefined });
    expect(c.body.length).toBe(10);
  });
  it("una página chica sale completa y lo dice", () => {
    expect(sliceFetchBody("hola")).toEqual({ body: "hola", offset: 0, length: 4, truncated: false, nextOffset: undefined });
  });
});

describe("web_fetch sin cortes mudos", () => {
  const big = "<html>" + "p".repeat(450_000) + "</html>";

  it("una página grande se guarda completa y regresa truncated + fetchId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(big));
    db.webJob.create.mockResolvedValue({ id: JOB });
    const r = await brightdataScrapeService.execute({ url: "https://www.amazon.com.mx/s?k=x" }, { userId: ME });
    expect(r.cost).toBe(1);
    expect(r.data).toMatchObject({ truncated: true, length: big.length, nextOffset: SCRAPE_BODY_MAX_LEN, fetchId: JOB });
    expect(r.data.body.length).toBe(SCRAPE_BODY_MAX_LEN);
    expect(store.putObject).toHaveBeenCalledOnce();
    expect(store.putObject.mock.calls[0][1].toString("utf8")).toBe(big);
  });

  it("el siguiente tramo sale de la copia, gratis y sin pedir la página otra vez", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(big));
    db.webJob.findFirst.mockResolvedValue({
      id: JOB,
      providerRef: "fetch/k.txt",
      createdAt: new Date(),
      meta: { url: "https://www.amazon.com.mx/s?k=x", statusCode: 200, format: "raw" },
    });
    const r = await brightdataScrapeService.execute({ fetchId: JOB, offset: 400_000 }, { userId: ME });
    expect(r.cost).toBe(0);
    expect(r.data).toMatchObject({ offset: 400_000, truncated: false, url: "https://www.amazon.com.mx/s?k=x" });
    expect(r.data.body.endsWith("</html>")).toBe(true);
    // Sólo lee el bucket: nunca vuelve a salir al proveedor.
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual(["https://bucket.test/fetch/k.txt"]);
    expect(db.webJob.findFirst).toHaveBeenCalledWith({ where: { id: JOB, userId: ME, kind: "fetch" } });
  });

  it("el fetchId de otro usuario o vencido es 404", async () => {
    db.webJob.findFirst.mockResolvedValue(null);
    await expect(brightdataScrapeService.execute({ fetchId: JOB }, { userId: ME })).rejects.toMatchObject({ providerStatus: 404 });
    db.webJob.findFirst.mockResolvedValue({ id: JOB, providerRef: "k", createdAt: new Date(Date.now() - 25 * 3600_000) });
    await expect(brightdataScrapeService.execute({ fetchId: JOB }, { userId: ME })).rejects.toMatchObject({ providerStatus: 404 });
  });

  it("si guardar falla, igual responde con el corte declarado", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(big));
    store.putObject.mockRejectedValue(new Error("bucket caído"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await brightdataScrapeService.execute({ url: "https://x.test/" }, { userId: ME });
    expect(r.data).toMatchObject({ truncated: true, fetchId: undefined });
  });
});

describe("sweepWebJobs: aviso al terminar, una sola vez", () => {
  const job = { id: JOB, userId: ME, source: "google_maps", providerRef: "s_1", createdAt: new Date() };
  const progress = (body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body));

  beforeEach(() => {
    db.webJob.findMany.mockImplementation(async ({ where }: any) => (where.kind === "extract" ? [job] : []));
  });

  it("listo → ready + web.extract.completed con la URL para recoger", async () => {
    progress({ status: "ready", records: 3 });
    db.webJob.updateMany.mockResolvedValue({ count: 1 });
    const r = await sweepWebJobs();
    expect(r).toMatchObject({ checked: 1, completed: 1, failed: 0 });
    expect(db.webJob.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: JOB, status: "running" }, data: { status: "ready", records: 3 } });
    expect(dispatchWebhooks).toHaveBeenCalledWith(ME, "web.extract.completed", {
      jobId: JOB,
      source: "google_maps",
      total: 3,
      url: expect.stringMatching(new RegExp(`/api/v2/web/extract/${JOB}$`)),
    });
  });

  it("si otro barrido (o el poll del cliente) ganó el paso, no avisa dos veces", async () => {
    progress({ status: "ready", records: 3 });
    db.webJob.updateMany.mockResolvedValue({ count: 0 });
    await sweepWebJobs();
    expect(dispatchWebhooks).not.toHaveBeenCalled();
  });

  it("en curso no hace nada; fallido o vencido avisa web.extract.failed", async () => {
    let spy = progress({ status: "running" });
    await sweepWebJobs();
    expect(db.webJob.updateMany).not.toHaveBeenCalled();

    spy.mockRestore();
    spy = progress({ status: "failed" });
    db.webJob.updateMany.mockResolvedValue({ count: 1 });
    await sweepWebJobs();
    expect(dispatchWebhooks).toHaveBeenLastCalledWith(ME, "web.extract.failed", { jobId: JOB, source: "google_maps", error: "provider failed" });

    spy.mockRestore();
    progress({ status: "running" });
    db.webJob.findMany.mockImplementation(async ({ where }: any) =>
      where.kind === "extract" ? [{ ...job, createdAt: new Date(Date.now() - EXTRACT_GIVE_UP_MS - 1000) }] : [],
    );
    await sweepWebJobs();
    expect(dispatchWebhooks).toHaveBeenLastCalledWith(ME, "web.extract.failed", { jobId: JOB, source: "google_maps", error: "timed out" });
  });

  it("borra los cuerpos de web_fetch vencidos y conserva la fila", async () => {
    db.webJob.findMany.mockImplementation(async ({ where }: any) =>
      where.kind === "fetch" ? [{ id: JOB, providerRef: "fetch/old.txt" }] : [],
    );
    const r = await sweepWebJobs();
    expect(store.deleteObject).toHaveBeenCalledWith("fetch/old.txt");
    expect(db.webJob.update).toHaveBeenCalledWith({ where: { id: JOB }, data: { providerRef: null } });
    expect(r.purged).toBe(1);
  });
});

describe("canario", () => {
  const ok = { ok: true, ms: 1, detail: "" };
  const bad = { ok: false, ms: 1, detail: "x" };

  it("clasifica operativo / degradado / caído", () => {
    expect(canaryStatus({ search: ok, fetch: ok, meli: ok })).toBe("operational");
    expect(canaryStatus({ search: ok, fetch: bad, meli: ok })).toBe("degraded");
    expect(canaryStatus({ search: bad, fetch: bad, meli: bad })).toBe("down");
  });

  it("avisa a la SEGUNDA falla seguida, no a la primera, y otra vez al recuperarse", async () => {
    // Todo el proveedor responde 500 → las tres sondas fallan.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("boom", { status: 500 }));
    db.appConfig.findUnique.mockResolvedValue(null);
    const first = await runWebCanary();
    expect(first).toMatchObject({ status: "down", failStreak: 1, notified: false });

    db.appConfig.findUnique.mockResolvedValue({ value: { failStreak: 1 } });
    sendTransactional.mockResolvedValue(undefined);
    const second = await runWebCanary();
    expect(second).toMatchObject({ failStreak: 2, notified: true });
    expect(sendTransactional.mock.calls[0][0].subject).toMatch(/CAÍDO/);
  });

  it("con el proveedor sano da verde (sin falsas alarmas): HTML real de MELI = 48 productos", async () => {
    const meli = fs.readFileSync(path.join(__dirname, "fixtures/meli-iphone-15.html"), "utf8");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const { url } = JSON.parse(String((init as RequestInit).body));
      if (url.includes("google.com")) return Response.json({ status_code: 200, body: JSON.stringify({ organic: [{}, {}] }) });
      if (url.includes("mercadolibre")) return new Response(meli);
      return new Response("<html>" + "a".repeat(50_000));
    });
    const r = await probeWebProvider();
    expect(r.search).toMatchObject({ ok: true, detail: "2 orgánicos" });
    expect(r.fetch.ok).toBe(true);
    expect(r.meli).toMatchObject({ ok: true, detail: "48 productos" });
    expect(canaryStatus(r)).toBe("operational");
  });
});
