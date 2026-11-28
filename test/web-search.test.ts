import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSearch, detectLanguage } from "../app/.server/services/providers/search/params";
import { normalizeSerpJson, resolveGotoLinks, urlFromDisplayLink, unwrapTranslate } from "../app/.server/services/providers/search/normalize";
import { parseYandexSerp, parseDuckDuckGoSerp } from "../app/.server/services/providers/parsers/serpHtml";
import { brightdataSearchService } from "../app/.server/services/providers/brightdata";

// Respuestas reales del proveedor guardadas el 28-nov-2026 con la búsqueda del usuario ruso.
const FX = path.join(__dirname, "fixtures/serp");
const fx = (f: string) => fs.readFileSync(path.join(FX, f), "utf8");
const serpBody = (f: string) => JSON.parse(JSON.parse(fx(f)).body);
const RU = "налог на доходы физических лиц";

describe("resolveSearch — parámetros por motor", () => {
  it("deduce el idioma y el país de una consulta en ruso y no sale por Rusia", () => {
    const s = resolveSearch({ query: RU });
    expect(s.language).toBe("ru");
    expect(s.country).toBe("ru");
    expect(s.url).toContain("hl=ru&gl=ru");
    expect(s.exitCountry).toBeUndefined();
  });

  it("country bloqueado: va en gl pero no como país de salida", () => {
    const s = resolveSearch({ query: "x", country: "RU" });
    expect(s.url).toContain("gl=ru");
    expect(s.exitCountry).toBeUndefined();
    expect(resolveSearch({ query: "x", country: "mx" }).exitCountry).toBe("mx");
    expect(resolveSearch({ query: "precio de llantas" }).exitCountry).toBe("mx");
  });

  it("google: ciudad, página, noticias, fecha y móvil", () => {
    const s = resolveSearch({ query: "precio de llantas", location: "Monterrey, Nuevo León, México", page: 2, type: "news", time: "week", device: "mobile" });
    expect(s.country).toBe("mx");
    expect(s.url).toContain("hl=es&gl=mx");
    expect(s.url).toContain("&uule=Monterrey%2C+Nuevo+Le%C3%B3n%2C+M%C3%A9xico");
    expect(s.url).toContain("&start=10&tbm=nws&tbs=qdr:w&brd_mobile=1&brd_json=1");
  });

  it("yandex va por HTML a yandex.ru con la región de la ciudad", () => {
    const s = resolveSearch({ query: RU, engine: "yandex", location: "Москва", page: 3 });
    expect(s.via).toBe("html");
    expect(s.url).toMatch(/^https:\/\/yandex\.ru\/search\/\?text=.*&lang=ru&lr=213&p=2$/);
    expect(s.url).not.toContain("brd_json");
    expect(resolveSearch({ query: RU, engine: "yandex" }).url).toContain("lr=225");
  });

  it("bing y duckduckgo localizados", () => {
    expect(resolveSearch({ query: RU, engine: "bing", page: 2 }).url).toContain("setlang=ru&cc=ru&mkt=ru-RU&first=11&brd_json=1");
    const d = resolveSearch({ query: RU, engine: "duckduckgo", time: "day" });
    expect(d.url).toContain("html.duckduckgo.com/html/?q=");
    expect(d.url).toContain("kl=ru-ru&df=d");
  });

  it("bing noticias con intervalo de tiempo", () => {
    const s = resolveSearch({ query: "peso mexicano dólar", engine: "bing", type: "news", time: "day" });
    expect(s.url).toContain("bing.com/news/search?q=");
    expect(s.url).toContain("&qft=interval%3D%227%22");
  });

  it("normaliza Bing Noticias real: ligas directas y fecha", () => {
    const n = normalizeSerpJson(serpBody("bing-news-mx.json"));
    expect(n.results).toHaveLength(12);
    expect(n.results[0].date).toBeTruthy();
    expect(n.results[0].snippet).toBeTruthy();
    expect(n.results.every((r) => !r.url.includes("goto"))).toBe(true);
  });

  it("rechaza combinaciones que el motor no tiene", () => {
    expect(() => resolveSearch({ query: "x", engine: "bing", type: "images" })).toThrow(/sólo está disponible/);
    expect(() => resolveSearch({ query: "x", engine: "yandex", time: "day" })).toThrow();
    expect(() => resolveSearch({ query: "x", country: "mex" })).toThrow();
    expect(() => resolveSearch({ query: "  " })).toThrow();
  });

  it("detectLanguage", () => {
    expect(detectLanguage("cómo sacar el RFC")).toBe("es");
    expect(detectLanguage("precio iphone en mexico")).toBe("es");
    expect(detectLanguage("best web scraping api")).toBe("en");
    expect(detectLanguage("податок на доходи фізичних осіб")).toBe("uk");
    expect(detectLanguage("東京の天気")).toBe("ja");
  });
});

describe("normalizeSerpJson — Google y Bing reales", () => {
  it("google ru: resultados limpios, preguntas y relacionadas", () => {
    const n = normalizeSerpJson(serpBody("google-ru.json"));
    expect(n.results.length).toBeGreaterThan(5);
    expect(n.results[0]).toMatchObject({ position: 1, url: "https://www.nalog.gov.ru/rn77/taxation/taxes/ndfl/" });
    expect(JSON.stringify(n)).not.toContain("data:image");
    expect(n.peopleAlsoAsk?.length).toBeGreaterThan(0);
    expect(n.related?.length).toBeGreaterThan(0);
    expect(n.hasNext).toBe(true);
    expect(n.reported).toMatchObject({ language: "ru", country: "RU" });
  });

  it("google noticias mx: fecha y fuente, sin base64", () => {
    const n = normalizeSerpJson(serpBody("google-mx-news.json"));
    expect(n.results).toHaveLength(10);
    expect(n.results[0].date).toBeTruthy();
    expect(n.results[0].source).toBeTruthy();
    expect(JSON.stringify(n)).not.toContain("base64");
  });

  it("bing: sin tracking_link", () => {
    const n = normalizeSerpJson(serpBody("bing-ru.json"));
    expect(n.results).toHaveLength(10);
    expect(JSON.stringify(n)).not.toContain("bing.com/ck/");
  });

  it("urlFromDisplayLink y unwrapTranslate", () => {
    expect(urlFromDisplayLink("https://www.marketinglaagencia.com")).toEqual({ url: "https://www.marketinglaagencia.com/", exact: true });
    expect(urlFromDisplayLink("https://escala.com › crm-ventas-pymes")).toEqual({ url: "https://escala.com/crm-ventas-pymes", exact: false });
    expect(urlFromDisplayLink("https://www.sage.com › Blog › Tecnología e Innovación")).toEqual({ url: "https://www.sage.com/", exact: false });
    expect(urlFromDisplayLink(undefined)).toBeNull();
    expect(unwrapTranslate("https://translate.google.com/translate?u=https://www.firecrawl.dev/blog/x&hl=es&sl=en")).toBe("https://www.firecrawl.dev/blog/x");
  });

  it("resolveGotoLinks cambia goto por la URL real; sin 302 usa la ruta visible", async () => {
    const fake = vi.fn(async (u: string) =>
      u.includes("ok") ? new Response(null, { status: 302, headers: { location: "https://real.example/a" } }) : new Response(null, { status: 200 }),
    );
    const out = await resolveGotoLinks(
      [
        { position: 1, title: "a", url: "https://www.google.com/goto?url=ok" },
        { position: 2, title: "b", url: "https://www.google.com/goto?url=bad" },
        { position: 3, title: "c", url: "https://www.google.com/goto?url=bad2", displayLink: "https://escala.com › crm" },
        { position: 4, title: "d", url: "https://d.example/" },
      ],
      fake as unknown as typeof fetch,
    );
    expect(out.map((r) => r.url)).toEqual(["https://real.example/a", "https://escala.com/crm", "https://d.example/"]);
    expect(out[1].urlApprox).toBe(true);
    expect(out.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(JSON.stringify(out)).not.toContain("displayLink");
  });
});

describe("parsers HTML — Yandex y DuckDuckGo reales", () => {
  it("yandex: orgánicos sin anuncios ni servicios de Yandex", () => {
    const { results } = parseYandexSerp(fx("yandex-ru.html"));
    expect(results.length).toBeGreaterThanOrEqual(8);
    expect(results.some((r) => r.url.startsWith("https://www.nalog.gov.ru/"))).toBe(true);
    expect(results.every((r) => !/yandex\.|yabs/.test(r.url))).toBe(true);
    expect(results[0].snippet).toBeTruthy();
  });

  it("duckduckgo: URL real desde uddg", () => {
    const { results } = parseDuckDuckGoSerp(fx("ddg-ru.html"));
    expect(results).toHaveLength(10);
    expect(results[0].url).toBe("https://www.nalog.gov.ru/rn77/taxation/taxes/ndfl/");
    expect(results.every((r) => !r.url.includes("duckduckgo.com/l/"))).toBe(true);
  });
});

describe("brightdataSearchService — cobro y buscar + leer", () => {
  const env = (body: unknown) =>
    new Response(JSON.stringify({ status_code: 200, headers: {}, body: typeof body === "string" ? body : JSON.stringify(body) }), { status: 200 });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BRIGHTDATA_API_TOKEN = "test-token";
  });

  it("una búsqueda cuesta 1 y no manda país de salida bloqueado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(env(serpBody("google-ru.json")));
    const r = await brightdataSearchService.execute({ query: RU, country: "ru", raw: false }, { userId: "u1" });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.country).toBeUndefined();
    expect(sent.url).toContain("gl=ru");
    expect(r.cost).toBe(1);
    expect(brightdataSearchService.estimateCost({ query: "x" })).toBe(1);
    expect(r.data.next).toEqual({ page: 2 });
    expect(r.data.raw).toBeUndefined();
  });

  it("yandex por la zona de lectura y parser propio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(env(fx("yandex-ru.html")));
    const r = await brightdataSearchService.execute({ query: RU, engine: "yandex" }, { userId: "u1" });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.zone).toBe(process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker");
    expect(r.data.results.length).toBeGreaterThanOrEqual(8);
  });

  it("read: cobra 1 + páginas leídas; la que falla deja contentError", async () => {
    const body = { organic: [{ title: "a", link: "https://a.example/" }, { title: "b", link: "https://b.example/" }], pagination: {} };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const sent = JSON.parse(String(init?.body));
      if (sent.url.includes("google.com/search")) return env(body);
      if (sent.url.startsWith("https://a.example")) return env("<html><body><main><h1>Hola</h1><p>Contenido de A.</p></main></body></html>");
      return new Response("boom", { status: 500 });
    });
    const r = await brightdataSearchService.execute({ query: "agentes de ia", read: 2 }, { userId: "u1" });
    expect(brightdataSearchService.estimateCost({ query: "x", read: 2 })).toBe(3);
    expect(r.data.results[0].content).toContain("Contenido de A");
    expect(r.data.results[1].contentError).toBeTruthy();
    expect(r.cost).toBe(2);
    expect(r.data.next).toBeNull();
  });
});
