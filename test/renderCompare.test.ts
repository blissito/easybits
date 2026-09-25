import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compareImages, htmlText, textCoverage, topRegions } from "../app/.server/core/renderCompare";

const W = 400;
const H = 300;

/** Fondo blanco con un rectángulo negro en (x,y,w,h). */
function page(rect: { x: number; y: number; w: number; h: number }): Buffer {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const v = inside ? 0 : 255;
      png.data[i] = v;
      png.data[i + 1] = v;
      png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const base = page({ x: 40, y: 40, w: 120, h: 80 });

describe("compareImages", () => {
  it("idénticas → 0 y confiable", async () => {
    const m = await compareImages(base, base, base);
    expect(m.trusted).toBe(true);
    expect(m.pixel).toBe(0);
    expect(m.layout).toBe(0);
    expect(m.regions).toEqual([]);
  });

  it("un bloque movido sube layout y la región apunta ahí", async () => {
    const moved = page({ x: 220, y: 180, w: 120, h: 80 });
    const m = await compareImages(base, moved, moved);
    expect(m.trusted).toBe(true);
    expect(m.layout).toBeGreaterThan(0.02);
    expect(m.pixel).toBeGreaterThan(0.1);
    const r = m.regions[0];
    expect(r).toBeDefined();
    // La celda más distinta cae sobre el bloque original o el movido.
    const hits = (bx: number, by: number) => r.x < bx + 120 && r.x + r.w > bx && r.y < by + 80 && r.y + r.h > by;
    expect(hits(40, 40) || hits(220, 180)).toBe(true);
  });

  it("dos renders distintos del candidato → no confiable", async () => {
    const other = page({ x: 41, y: 40, w: 120, h: 80 });
    const m = await compareImages(base, base, other);
    expect(m.trusted).toBe(false);
  });

  it("ajusta un candidato de tamaño distinto en vez de fallar", async () => {
    const bigger = new PNG({ width: W + 2, height: H + 2 });
    bigger.data.fill(255);
    const m = await compareImages(base, PNG.sync.write(bigger), PNG.sync.write(bigger));
    expect(m.pixel).toBeGreaterThan(0);
  });

  it("el montaje mide tres veces el ancho", async () => {
    const m = await compareImages(base, base, base);
    const img = PNG.sync.read(m.montage);
    expect(img.width).toBe(W * 3 + 24);
    expect(img.height).toBe(H);
  });
});

describe("topRegions", () => {
  it("ordena por diferencia y es estable", () => {
    const diff = new PNG({ width: 40, height: 40 });
    diff.data.fill(128);
    const paint = (x0: number, y0: number, n: number) => {
      let c = 0;
      for (let y = y0; y < y0 + 10 && c < n; y++)
        for (let x = x0; x < x0 + 10 && c < n; x++, c++) {
          const i = (y * 40 + x) * 4;
          diff.data[i] = 255;
          diff.data[i + 1] = 0;
          diff.data[i + 2] = 0;
        }
    };
    paint(30, 30, 50);
    paint(0, 0, 10);
    const r = topRegions(diff);
    expect(r.map((c) => [c.x, c.y])).toEqual([[30, 30], [0, 0]]);
    expect(r[0].ratio).toBe(0.5);
    expect(topRegions(diff)).toEqual(r);
  });
});

describe("textCoverage", () => {
  const pdf = "Reporte anual 2025\nVentas crecieron 12% en México y Colombia.";

  it("texto presente como texto → 1", () => {
    const html = `<h1>Reporte anual 2025</h1><p>Ventas crecieron 12% en <b>México</b> y Colombia.</p>`;
    expect(textCoverage(pdf, html)).toBe(1);
  });

  it("el PDF pegado como imagen → 0 (no pasa aunque se vea igual)", () => {
    expect(textCoverage(pdf, `<img src="data:image/png;base64,AAAA" style="width:100%">`)).toBe(0);
  });

  it("texto dentro de script o style no cuenta", () => {
    const html = `<style>/* Reporte anual 2025 */</style><script>const t="Ventas crecieron 12% en México y Colombia"</script>`;
    expect(textCoverage(pdf, html)).toBe(0);
  });

  it("parcial cuenta repeticiones", () => {
    const html = "<p>Reporte anual 2025 ventas</p>";
    // 9 palabras de ≥2 letras en el PDF ("y" no cuenta); 4 presentes.
    expect(textCoverage(pdf, html)).toBeCloseTo(4 / 9, 4);
  });

  it("PDF sin texto (escaneado) → null", () => {
    expect(textCoverage("  \f ", "<p>lo que sea</p>")).toBeNull();
  });

  it("decodifica entidades", () => {
    expect(htmlText("Ma&ntilde;ana &amp; Pap&#225;").includes("Papá")).toBe(true);
  });
});
