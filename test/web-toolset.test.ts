import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── Parser Mercado Libre (fixture real de 2026-09-04) ──────────────────────
import { parseMercadoLibreListing, mercadoLibreListingUrl } from "../app/.server/services/providers/parsers/mercadolibre";

describe("parseMercadoLibreListing", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/meli-iphone-15.html"), "utf8");
  it("saca los 48 productos de una página con título, precio y link directo", () => {
    const r = parseMercadoLibreListing(html);
    expect(r.length).toBe(48);
    expect(r.filter((x) => !x.url).length).toBe(0);
    expect(r.filter((x) => x.price == null).length).toBe(0);
    expect(r[0]).toMatchObject({ title: expect.stringContaining("iPhone 15"), price: 14999, seller: "Apple" });
    expect(r[0].url).toMatch(/^https:\/\/www\.mercadolibre\.com\.mx\//);
    expect(r[0].url).not.toContain("#");
  });
  it("arma la URL del listado con slug y paginación por offset de 48", () => {
    expect(mercadoLibreListingUrl("iPhone 15 Pro")).toBe("https://listado.mercadolibre.com.mx/iphone-15-pro");
    expect(mercadoLibreListingUrl("cámara canon", 2)).toBe("https://listado.mercadolibre.com.mx/camara-canon_Desde_49");
  });
});

// ── Packs ──────────────────────────────────────────────────────────────────
import { findPackById, WEB_PACKS } from "../app/lib/plans";

describe("WEB_PACKS", () => {
  it("resuelve al bucket web con su precio", () => {
    expect(findPackById("web_400")).toEqual({ id: "web_400", bucket: "web", type: "web_pack", amount: 400, priceMxn: 99 });
    expect(findPackById("web_10000")?.amount).toBe(10000);
  });
  it("mantiene ≥120% de profit sobre el costo peor caso ($0.045 MXN/consulta)", () => {
    for (const p of WEB_PACKS) {
      const cost = p.queries * 0.045;
      expect((p.price - cost) / cost).toBeGreaterThan(1.2);
    }
  });
});

// ── consumeService con product "research" → bucket web, cobra costo real ───
const dbMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  aiGenerationLog: { create: vi.fn().mockReturnValue({ catch: () => {} }) },
}));
vi.mock("../app/.server/db", () => ({ db: dbMock }));
vi.mock("../app/.server/services/registry", () => ({
  getService: (id: string) =>
    id === "research.test"
      ? { id, product: "research", estimateCost: () => 10, execute: async () => ({ cost: 3, data: { ok: true } }) }
      : null,
}));

import { consumeService } from "../app/.server/services/consume";
import { QuotaExceededError } from "../app/.server/services/errors";

describe("consumeService (web)", () => {
  beforeEach(() => {
    dbMock.user.findUnique.mockReset();
    dbMock.user.update.mockReset();
  });
  it("cobra el costo real que reporta el provider, no el estimado", async () => {
    dbMock.user.findUnique.mockResolvedValue({ webQueriesBonus: 50 });
    const r = await consumeService("research.test", {}, { userId: "u1" });
    expect(r.data).toEqual({ ok: true });
    expect(dbMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { webQueriesBonus: 47 } });
  });
  it("rechaza con QuotaExceededError unit=web cuando no alcanza el estimado", async () => {
    dbMock.user.findUnique.mockResolvedValue({ webQueriesBonus: 5 });
    await expect(consumeService("research.test", {}, { userId: "u1" })).rejects.toMatchObject({ unit: "web", requiredCost: 10, available: 5 });
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });
  it("nunca deja el saldo negativo", async () => {
    dbMock.user.findUnique.mockResolvedValue({ webQueriesBonus: 12 });
    const { chargeWebQueries } = await import("../app/.server/webQuota");
    await chargeWebQueries("u1", { cost: 20, type: "x" });
    expect(dbMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { webQueriesBonus: 0 } });
  });
  it("QuotaExceededError por default sigue siendo de créditos", () => {
    expect(new QuotaExceededError("s", 1, 0).unit).toBe("credits");
  });
});

// ── onlyMainContent (fixture real: runpod.io/kimi-k3 vía web_crawl) ────────
import { extractMainContent } from "../app/.server/services/providers/parsers/mainContent";

describe("extractMainContent", () => {
  const md = fs.readFileSync(path.join(__dirname, "fixtures/runpod-kimi-k3.md"), "utf8");
  it("quita nav y footer y arranca en el H1", () => {
    const c = extractMainContent(md);
    expect(c.startsWith("# Kimi K3 on Runpod")).toBe(true);
    expect(c).not.toContain("Skip to main content");
    expect(c).not.toContain("Terms of Service");
    expect(c).not.toContain("© 2026");
    expect(c).toContain("### Model details");
    expect(c.length).toBeLessThan(md.length * 0.6);
  });
  it("conserva imágenes de contenido y tira iconos/svg", () => {
    const c = extractMainContent("# T\n\n![Runpod hero](https://x/hero.webp)\n\n![News icon](https://x/news-icon.svg)\n\ntexto.");
    expect(c).toContain("hero.webp");
    expect(c).not.toContain("news-icon.svg");
  });
});

// ── Reintento del captcha de la zona SERP ─────────────────────────────────
// El envelope de Brightdata llega con HTTP 200 aunque el target falle: el
// captcha de Google viene como status_code 502 (`expect_body`) y el cooldown
// posterior como 429 (`failed_query_rejected`), ambos con body vacío.
import { brightdataSearchService } from "../app/.server/services/providers/brightdata";
import { ServiceProviderError } from "../app/.server/services/errors";

const envelope = (status: number, code: string, body = "") =>
  new Response(JSON.stringify({ status_code: status, headers: { "x-brd-error-code": code, "x-brd-error": code }, body }), { status: 200 });

const okEnvelope = (body: unknown) =>
  new Response(JSON.stringify({ status_code: 200, headers: {}, body: JSON.stringify(body) }), { status: 200 });

describe("brightdataRequest — captcha de la zona SERP", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BRIGHTDATA_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "setTimeout" as never).mockImplementation(((fn: () => void) => { fn(); return 0 as never; }) as never);
  });

  it("reintenta el 502 expect_body y devuelve el resultado del segundo intento", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelope(502, "expect_body"))
      .mockResolvedValueOnce(okEnvelope({ organic: [{ title: "hit" }] }));
    const r = await brightdataSearchService.execute({ query: "agentes de ia" }, { userId: "u1" } as never);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((r.data as { results: { organic: unknown[] } }).results.organic).toHaveLength(1);
  });

  it("agota los reintentos si el captcha persiste", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => envelope(502, "captcha"));
    await expect(brightdataSearchService.execute({ query: "x" }, { userId: "u1" } as never)).rejects.toBeInstanceOf(ServiceProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("NO reintenta el cooldown 429: insistir sólo lo alarga", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => envelope(429, "failed_query_rejected"));
    const err = await brightdataSearchService.execute({ query: "x" }, { userId: "u1" } as never).catch((e) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ServiceProviderError);
    expect((err as ServiceProviderError).providerStatus).toBe(429);
  });
});
