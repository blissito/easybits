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
const generateObject = vi.hoisted(() => vi.fn());
const schemaHook = vi.hoisted(() => ({ fail: false }));
vi.mock("ai", () => ({
  generateObject,
  jsonSchema: (s: unknown) => {
    if (schemaHook.fail) throw new Error("No object generated");
    return { jsonSchema: s };
  },
}));
vi.mock("../app/.server/aiModels", () => ({ getAiModel: async () => "haiku", resolveModelLocal: (id: string) => ({ id }) }));

import {
  brightdataScrapeService,
  sliceFetchBody,
  SCRAPE_BODY_MAX_LEN,
} from "../app/.server/services/providers/brightdata";
import fs from "node:fs";
import path from "node:path";
import { probeWebProvider, brightdataMapService, parseSitemap, brightdataExtractService, schemaExtractCost, strictJsonSchema } from "../app/.server/services/providers/brightdata";
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

describe("errores del proveedor", () => {
  it("un 502 de su balanceador se reintenta y pasa", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("<h1>502 Bad Gateway</h1>", { status: 502 }))
      .mockResolvedValueOnce(new Response("<html>ok</html>"));
    const r = await brightdataScrapeService.execute({ url: "https://x.test/" }, { userId: ME });
    expect(r.data.body).toBe("<html>ok</html>");
  });

  it("si sigue fallando, el error no nombra al proveedor ni trae su HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<h1>502 Bad Gateway</h1> Brightdata", { status: 502 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await brightdataScrapeService.execute({ url: "https://x.test/" }, { userId: ME }).catch((e) => e);
    expect(err.providerStatus).toBe(502);
    expect(err.providerMessage).not.toMatch(/brightdata|<h1>/i);
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

describe("web_map", () => {
  // El desbloqueador recibe { url } en el body: se responde según la URL pedida.
  const site = (pages: Record<string, string>) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const { url, format } = JSON.parse(String((init as RequestInit).body));
      const body = pages[url];
      if (body === undefined) return format === "json" ? Response.json({ status_code: 404, body: "" }) : new Response("", { status: 404 });
      return format === "json" ? Response.json({ status_code: 200, body }) : new Response(body);
    });

  it("lee robots → índice de sitemaps → sitemaps, filtra y cobra por documento", async () => {
    site({
      "https://ej.test/robots.txt": "User-agent: *\nSitemap: https://ej.test/sitemap_index.xml\n",
      "https://ej.test/sitemap_index.xml": `<sitemapindex><sitemap><loc>https://ej.test/s1.xml</loc></sitemap><sitemap><loc>https://ej.test/s2.xml.gz</loc></sitemap></sitemapindex>`,
      "https://ej.test/s1.xml": `<urlset><url><loc>https://ej.test/blog/a</loc></url><url><loc><![CDATA[https://www.ej.test/blog/b?x=1&amp;y=2]]></loc></url><url><loc>https://ej.test/precios</loc></url><url><loc>https://otro.test/blog/z</loc></url></urlset>`,
    });
    const r = await brightdataMapService.execute({ url: "https://ej.test/", search: "/blog/" }, { userId: ME });
    expect(r.data).toMatchObject({
      source: "sitemap",
      total: 2,
      truncated: false,
      urls: ["https://ej.test/blog/a", "https://www.ej.test/blog/b?x=1&y=2"],
    });
    expect(r.cost).toBe(3); // robots + índice + s1 (el .gz no se pide)
  });

  it("lee primero los hijos del índice aunque robots declare muchos sitemaps muertos (caso Liverpool)", async () => {
    const dead = Array.from({ length: 13 }, (_, i) => `Sitemap: https://ej.test/${i}img.xml`).join("\n");
    site({
      "https://ej.test/robots.txt": `Sitemap: https://ej.test/index.xml\n${dead}`,
      "https://ej.test/index.xml": `<sitemapindex><sitemap><loc>https://ej.test/bebes.xml</loc></sitemap></sitemapindex>`,
      "https://ej.test/bebes.xml": `<urlset><url><loc>https://ej.test/p/1</loc></url></urlset>`,
    });
    const r = await brightdataMapService.execute({ url: "https://ej.test/" }, { userId: ME });
    expect(r.data).toMatchObject({ source: "sitemap", urls: ["https://ej.test/p/1"] });
  });

  it("si los sitemaps se comen el cupo sin dar nada, todavía cae a los links", async () => {
    const dead = Array.from({ length: 20 }, (_, i) => `Sitemap: https://ej.test/${i}.xml`).join("\n");
    site({ "https://ej.test/robots.txt": dead, "https://ej.test/": "[A](/a)" });
    const r = await brightdataMapService.execute({ url: "https://ej.test/" }, { userId: ME });
    expect(r.data).toMatchObject({ source: "links", urls: ["https://ej.test/a"] });
    expect(r.cost).toBe(10);
  });

  it("sin sitemap usa los links internos de la portada", async () => {
    site({ "https://ej.test/": "[Precios](/precios) [Blog](https://ej.test/blog) [Fuera](https://otro.test/x)" });
    const r = await brightdataMapService.execute({ url: "https://ej.test/" }, { userId: ME });
    expect(r.data.source).toBe("links");
    expect(r.data.urls.sort()).toEqual(["https://ej.test/blog", "https://ej.test/precios"]);
  });

  it("respeta limit y avisa que había más", async () => {
    const locs = Array.from({ length: 30 }, (_, i) => `<url><loc>https://ej.test/p${i}</loc></url>`).join("");
    site({ "https://ej.test/robots.txt": "", "https://ej.test/sitemap.xml": `<urlset>${locs}</urlset>` });
    const r = await brightdataMapService.execute({ url: "https://ej.test/", limit: 10 }, { userId: ME });
    expect(r.data).toMatchObject({ total: 30, truncated: true });
    expect(r.data.urls).toHaveLength(10);
  });

  it("parseSitemap distingue índice de lista", () => {
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a/s.xml</loc></sitemap></sitemapindex>")).toEqual({ urls: [], sitemaps: ["https://a/s.xml"] });
    expect(parseSitemap("<urlset><url><loc> https://a/x </loc></url></urlset>").urls).toEqual(["https://a/x"]);
  });
});

describe("web_extract con url + schema", () => {
  const schema = { type: "object", properties: { plans: { type: "array", items: { type: "object" } } } };
  const page = (md: string) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ status_code: 200, body: md }));

  beforeEach(() => generateObject.mockClear());

  it("lee la página, le pasa el esquema al modelo y cobra según los tokens", async () => {
    page("# Precios\nByte $199 MXN");
    generateObject.mockResolvedValue({ object: { plans: [{ name: "Byte", priceMxn: 199 }] }, usage: { inputTokens: 9000, outputTokens: 600 } });
    const r = await brightdataExtractService.execute({ url: "https://ej.test/planes", schema, prompt: "sólo mensuales" }, { userId: ME });
    expect(r.data).toMatchObject({ status: "done", source: "ej.test", data: { plans: [{ name: "Byte", priceMxn: 199 }] }, truncated: false });
    expect(r.cost).toBe(schemaExtractCost(9600)); // 1 + ceil(9600/4000) = 4
    expect(r.cost).toBe(4);
    const call = generateObject.mock.calls[0][0];
    expect(call.schema).toEqual({ jsonSchema: strictJsonSchema(schema) });
    expect(call.prompt).toContain("Instrucción: sólo mensuales");
    expect(call.prompt).toContain("Byte $199 MXN");
    expect(call.system).toMatch(/nunca lo inventes/);
  });

  it("una página enorme se corta para el modelo y lo dice", async () => {
    page("x".repeat(200_000));
    generateObject.mockResolvedValue({ object: {}, usage: { inputTokens: 15000, outputTokens: 10 } });
    const r = await brightdataExtractService.execute({ url: "https://ej.test/", schema }, { userId: ME });
    expect(r.data.truncated).toBe(true);
    expect(generateObject.mock.calls[0][0].prompt.length).toBeLessThan(61_000);
  });

  it("si el modelo no puede llenar el esquema → 422, sin cobro", async () => {
    page("hola");
    // La falla se simula en jsonSchema (función normal, dentro del mismo try que generateObject):
    // un vi.fn que lanza queda reportado como error del test en esta suite aunque el código lo atrape.
    schemaHook.fail = true;
    const err = await brightdataExtractService.execute({ url: "https://ej.test/", schema }, { userId: ME }).then(
      () => null,
      (e) => e,
    );
    expect(err?.name).toBe("ServiceProviderError");
    expect(err?.providerStatus).toBe(422);
    expect(err?.providerMessage).toMatch(/no pudo llenar el esquema/);
    schemaHook.fail = false;
  });

  it("url sin schema (o al revés) → 400", async () => {
    await expect(brightdataExtractService.execute({ url: "https://ej.test/" }, { userId: ME })).rejects.toMatchObject({ providerStatus: 400 });
    await expect(brightdataExtractService.execute({ schema }, { userId: ME })).rejects.toMatchObject({ providerStatus: 400 });
  });
});

describe("strictJsonSchema", () => {
  it("pone additionalProperties:false en CADA objeto (raíz, propiedades, items, anyOf, $defs) y respeta lo explícito", () => {
    const out = strictJsonSchema({
      type: "object",
      properties: {
        plans: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
        meta: { type: ["object", "null"], properties: { a: { type: "string" } } },
        free: { type: "object", additionalProperties: true },
        pick: { anyOf: [{ type: "object", properties: { x: { type: "number" } } }, { type: "string" }] },
        // una propiedad que SE LLAMA "properties" no se confunde con la palabra clave
        properties: { type: "string" },
      },
      $defs: { Plan: { type: "object", properties: { n: { type: "string" } } } },
    }) as any;
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.plans.items.additionalProperties).toBe(false);
    expect(out.properties.meta.additionalProperties).toBe(false);
    expect(out.properties.free.additionalProperties).toBe(true);
    expect(out.properties.pick.anyOf[0].additionalProperties).toBe(false);
    expect(out.properties.pick.anyOf[1]).toEqual({ type: "string" });
    expect(out.properties.properties).toEqual({ type: "string" });
    expect(out.$defs.Plan.additionalProperties).toBe(false);
  });
});
