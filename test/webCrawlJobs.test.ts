import { describe, it, expect, vi, beforeEach } from "vitest";

// Rastreo grande en segundo plano: avanza por lotes, una pasada a la vez por job, cobra lo
// leído (nunca dos veces), para al acabarse la cola, el tope o las consultas, y avisa.

const db = vi.hoisted(() => ({
  webJob: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

import { advanceCrawlJob, createCrawlJob, readCrawlJob, type CrawlJobMeta } from "../app/.server/core/webCrawlJobs";

const ME = "a".repeat(24);
const JOB = "c".repeat(24);

// Sitio falso: cada página enlaza a dos hijas; las URLs con "roto" fallan.
function site() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
    const target = String(u);
    if (target.startsWith("https://bucket.test/")) {
      const body = blobs.get(target.slice("https://bucket.test/".length));
      return body ? new Response(body) : new Response("", { status: 404 });
    }
    const { url } = JSON.parse(String((init as RequestInit).body));
    if (url.includes("roto")) return Response.json({ status_code: 500, headers: {}, body: "" });
    const n = Number(new URL(url).pathname.slice(2) || 0);
    return Response.json({ status_code: 200, body: `# página ${n}\n[a](/p${n * 2 + 1}) [b](/p${n * 2 + 2})` });
  });
}

let row: { id: string; userId: string; status: string; meta: CrawlJobMeta; error?: string | null; providerRef?: string | null };
const meta = (over: Partial<CrawlJobMeta> = {}): CrawlJobMeta => ({
  startUrl: "https://ej.test/",
  maxPages: 30,
  queue: ["https://ej.test/p0"],
  seen: ["https://ej.test/p0"],
  done: 0,
  failed: 0,
  chunks: 0,
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.BRIGHTDATA_API_TOKEN = "t";
  blobs.clear();
  for (const f of Object.values(db.webJob)) f.mockReset();
  quota.checkWebQuota.mockReset().mockResolvedValue({ available: 1000 });
  quota.chargeWebQueries.mockReset();
  dispatchWebhooks.mockReset();
  row = { id: JOB, userId: ME, status: "running", meta: meta() };
  db.webJob.updateMany.mockResolvedValue({ count: 1 });
  db.webJob.findUnique.mockImplementation(async () => structuredClone(row));
  db.webJob.findFirst.mockImplementation(async () => structuredClone(row));
  db.webJob.update.mockImplementation(async ({ data }: any) => {
    row = { ...row, ...data, meta: data.meta ?? row.meta };
    return row;
  });
});

describe("advanceCrawlJob", () => {
  it("lee un lote, guarda el bloque, cobra lo leído y deja el resto en la cola", async () => {
    site();
    const r = await advanceCrawlJob(JOB);
    expect(r.advanced).toBe(1); // la cola sólo tenía p0
    expect(row.meta).toMatchObject({ done: 1, chunks: 1 });
    expect(row.meta.queue).toEqual(["https://ej.test/p1", "https://ej.test/p2"]);
    expect(quota.chargeWebQueries).toHaveBeenCalledWith(ME, expect.objectContaining({ cost: 1, resourceId: JOB }));

    const r2 = await advanceCrawlJob(JOB);
    expect(r2.advanced).toBe(2);
    expect(row.meta.done).toBe(3);
  });

  it("guarda el avance ANTES de cobrar (una falla a la mitad nunca cobra doble)", async () => {
    site();
    const order: string[] = [];
    db.webJob.update.mockImplementation(async ({ data }: any) => {
      order.push("save");
      row = { ...row, ...data, meta: data.meta ?? row.meta };
    });
    quota.chargeWebQueries.mockImplementation(async () => void order.push("charge"));
    await advanceCrawlJob(JOB);
    expect(order).toEqual(["save", "charge"]);
  });

  it("si otra pasada tiene el candado, no hace nada", async () => {
    site();
    db.webJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await advanceCrawlJob(JOB)).toEqual({ advanced: 0 });
    expect(quota.chargeWebQueries).not.toHaveBeenCalled();
  });

  it("para en maxPages, avisa web.crawl.completed y las páginas fallidas no se cobran", async () => {
    site();
    row.meta = meta({ maxPages: 3, queue: ["https://ej.test/p0", "https://ej.test/roto", "https://ej.test/p5", "https://ej.test/p6"] });
    await advanceCrawlJob(JOB); // lote de 3: p0 y p5 bien, «roto» falla
    expect(row.status).toBe("running");
    expect(row.meta).toMatchObject({ done: 2, failed: 1 });
    expect(quota.chargeWebQueries).toHaveBeenLastCalledWith(ME, expect.objectContaining({ cost: 2 }));
    await advanceCrawlJob(JOB); // falta 1 para el tope
    expect(row.status).toBe("done");
    expect(row.meta.done).toBe(3);
    expect(quota.chargeWebQueries).toHaveBeenLastCalledWith(ME, expect.objectContaining({ cost: 1 }));
    expect(dispatchWebhooks).toHaveBeenCalledWith(ME, "web.crawl.completed", expect.objectContaining({ jobId: JOB, total: 3 }));
  });

  it("una página caída cuenta como fallida y no se cobra", async () => {
    site();
    row.meta = meta({ queue: ["https://ej.test/roto"], maxPages: 50 });
    await advanceCrawlJob(JOB);
    expect(row.meta).toMatchObject({ done: 0, failed: 1 });
    expect(quota.chargeWebQueries).not.toHaveBeenCalled();
    expect(row.status).toBe("done"); // cola vacía
  });

  it("sin consultas para y avisa web.crawl.failed, conservando lo leído", async () => {
    site();
    row.meta = meta({ done: 7, chunks: 1 });
    quota.checkWebQuota.mockResolvedValue({ available: 0 });
    await advanceCrawlJob(JOB);
    expect(row.status).toBe("error");
    expect(dispatchWebhooks).toHaveBeenCalledWith(ME, "web.crawl.failed", expect.objectContaining({ total: 7, error: expect.stringMatching(/consultas/) }));
  });

  it("nunca lee más páginas que las consultas que quedan", async () => {
    site();
    row.meta = meta({ queue: Array.from({ length: 10 }, (_, i) => `https://ej.test/p${i + 100}`) });
    quota.checkWebQuota.mockResolvedValue({ available: 4 });
    const r = await advanceCrawlJob(JOB);
    expect(r.advanced).toBe(4);
  });
});

describe("readCrawlJob", () => {
  it("devuelve el estado y un bloque de páginas con su cursor", async () => {
    site();
    await advanceCrawlJob(JOB); // bloque 0: p0
    await advanceCrawlJob(JOB); // bloque 1: p1, p2
    const a = await readCrawlJob(ME, JOB, 0);
    expect(a).toMatchObject({ status: "running", done: 3, nextCursor: 1 });
    expect(a!.pages.map((p) => p.url)).toEqual(["https://ej.test/p0"]);
    const b = await readCrawlJob(ME, JOB, 1);
    expect(b!.pages).toHaveLength(2);
    expect(b!.nextCursor).toBeNull();
    expect(db.webJob.findFirst).toHaveBeenCalledWith({ where: { id: JOB, userId: ME, kind: "crawl" } });
  });

  it("jobId inválido o ajeno → null", async () => {
    db.webJob.findFirst.mockResolvedValue(null);
    expect(await readCrawlJob(ME, JOB)).toBeNull();
    expect(await readCrawlJob(ME, "nope")).toBeNull();
  });
});

describe("createCrawlJob", () => {
  it("normaliza las URLs del sitemap: la raíz con y sin «/» es UNA página (no se cobra dos veces)", async () => {
    db.webJob.create.mockImplementation(async ({ data }: any) => ({ id: JOB, ...data }));
    const job = await createCrawlJob(ME, {
      startUrl: "https://ej.test/",
      maxPages: 100,
      seed: ["https://ej.test", "https://ej.test/blog/", "https://ej.test/blog", "https://ej.test/blog#top"],
    });
    expect((job.meta as CrawlJobMeta).queue).toEqual(["https://ej.test/", "https://ej.test/blog"]);
  });
});
