import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enrichSectionIcons,
  fetchIconSvg,
  searchIcons,
  ICON_SETS,
  DEFAULT_PREFIXES,
} from "../packages/html-tailwind-generator/src/images/enrichIcons";

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>';
const calls: string[] = [];

function mockFetch(handler: (url: string) => { ok: boolean; body?: string; json?: unknown }) {
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    const r = handler(String(url));
    return {
      ok: r.ok,
      text: async () => r.body ?? "",
      json: async () => r.json ?? {},
    } as unknown as Response;
  });
}

beforeEach(() => { calls.length = 0; });
afterEach(() => vi.unstubAllGlobals());

describe("iconos", () => {
  it("el orden de prefijos por defecto NO cambia (cambia el icono de todo lo ya generado)", () => {
    expect(DEFAULT_PREFIXES).toEqual(["lucide", "heroicons", "material-symbols"]);
  });

  it("enrichSectionIcons sigue barriendo prefijos en orden y conservando las clases del span", async () => {
    // lucide falla, heroicons responde → debe pedir lucide ANTES que heroicons
    mockFetch((url) => (url.includes("/heroicons/") ? { ok: true, body: SVG } : { ok: false }));
    const html = `<p><span class="w-6 h-6 text-red-500" data-icon-query="scissors"></span></p>`;
    const out = await enrichSectionIcons(html);
    expect(out).toContain('<svg class="w-6 h-6 text-red-500"');
    expect(out).not.toContain("data-icon-query");
    const idxLucide = calls.findIndex((c) => c.includes("/lucide/"));
    const idxHero = calls.findIndex((c) => c.includes("/heroicons/"));
    expect(idxLucide).toBeGreaterThanOrEqual(0);
    expect(idxLucide).toBeLessThan(idxHero);
  });

  it("un nombre con prefijo explícito respeta su set y no barre los demás", async () => {
    mockFetch(() => ({ ok: true, body: SVG }));
    await fetchIconSvg("tabler:heart");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/tabler/heart.svg");
  });

  it("pide currentColor + 1em para que herede color y tamaño del contenedor", async () => {
    mockFetch(() => ({ ok: true, body: SVG }));
    await fetchIconSvg("lucide:star");
    expect(calls[0]).toContain("color=currentColor");
    expect(calls[0]).toContain("height=1em");
  });

  it("searchIcons devuelve candidatos con licencia y flag de marca", async () => {
    mockFetch((url) =>
      url.includes("/search")
        ? { ok: true, json: { icons: ["lucide:scissors", "simple-icons:nike"] } }
        : { ok: true, body: SVG }
    );
    const icons = await searchIcons("scissors", { limit: 2 });
    expect(icons.map((i) => i.name)).toEqual(["lucide:scissors", "simple-icons:nike"]);
    expect(icons[0]).toMatchObject({ license: "ISC", trademark: false });
    // CC0 en el archivo, pero la marca sigue viva
    expect(icons[1]).toMatchObject({ license: "CC0-1.0", trademark: true });
    expect(icons[0].svg).toContain("<svg");
  });

  it("si Iconify se cae devuelve [] en vez de lanzar (es una tool de cara al usuario)", async () => {
    mockFetch(() => { throw new Error("ECONNREFUSED"); });
    await expect(searchIcons("x")).resolves.toEqual([]);
  });

  it("todo set declarado trae licencia", () => {
    for (const [prefix, meta] of Object.entries(ICON_SETS)) {
      expect(meta.license, prefix).toBeTruthy();
    }
  });
});
