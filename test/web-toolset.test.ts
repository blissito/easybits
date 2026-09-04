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
