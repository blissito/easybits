import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  familyKey,
  fontDiff,
  htmlViolations,
  sourceText,
  liveTextShare,
  matchText,
  overflowOf,
  parsePdffonts,
  parseStext,
  sameImage,
  toWords,
  topRegions,
  type Char,
  type FontInfo,
  type Word,
} from "../app/.server/core/renderCompare";

// ─── helpers ────────────────────────────────────────────────────────────────

const F: FontInfo = { family: "NotoSans-Regular", size: 10, weight: 400, italic: false, color: "#000000" };

/** Caracteres de una palabra a partir de (x,y), 5 pt de avance cada uno. */
function chars(text: string, x: number, y: number, over: Partial<Char> = {}): Char[] {
  return [...text].map((c, i) => ({
    c,
    x: x + i * 5,
    y,
    x1: x + i * 5 + 4.5,
    size: 10,
    font: "NotoSans-Regular",
    weight: 400,
    italic: false,
    color: "#000000",
    ...over,
  }));
}
const space = (x: number, y: number): Char => ({ ...chars(" ", x, y)[0] });
const word = (text: string, x: number, y: number, font: Partial<FontInfo> = {}): Word => ({
  text,
  x,
  y,
  width: (text.length - 1) * 5 + 4.5,
  font: { ...F, ...font },
});

function png(w: number, h: number, paint: (x: number, y: number) => number): Buffer {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = paint(x, y);
      const i = (y * w + x) * 4;
      p.data[i] = p.data[i + 1] = p.data[i + 2] = v;
      p.data[i + 3] = 255;
    }
  return PNG.sync.write(p);
}

// ─── extracción ─────────────────────────────────────────────────────────────

describe("parseStext + toWords", () => {
  const xml = `<page id="page1" width="612" height="792">
<block bbox="0 0 1 1"><line bbox="100 90 200 102">
<font name="Type3 (8 0 R)" size="10">
<char c="H" quad="100 0 104.5 0 0 0 0 0" x="100" y="100" color="#111111"/>
<char c="o" quad="105 0 109.5 0 0 0 0 0" x="105" y="100" color="#111111"/>
<char c=" " quad="110 0 113 0 0 0 0 0" x="110" y="100" color="#111111"/>
<char c="l" quad="114 0 116 0 0 0 0 0" x="114" y="100" color="#111111"/>
<char c="a" quad="130 0 134 0 0 0 0 0" x="130" y="100" color="#111111"/>
</font></line></block></page>`;
  const meta = new Map([["8", { name: "Inter-Regular", weight: 700, italic: false }]]);
  const page = parseStext(xml, meta);

  it("lee tamaño de página, líneas y la fuente Type 3 por objeto", () => {
    expect(page.width).toBe(612);
    expect(page.lines).toHaveLength(1);
    expect(page.chars.find((c) => c.c === "H")).toMatchObject({ font: "Inter-Regular", weight: 700, color: "#111111" });
  });

  it("corta palabras en espacios y en huecos grandes (PDFs que no dibujan el espacio)", () => {
    expect(toWords(page.chars).map((w) => w.text)).toEqual(["Ho", "l", "a"]);
  });

  it("el peso sale del descriptor aunque el nombre diga Regular", () => {
    expect(toWords(page.chars)[0].font.weight).toBe(700);
  });

  it("parsePdffonts saca nombre y objeto", () => {
    const out = `name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
BCDHEE+NotoSans-Bold                 TrueType          WinAnsi          yes yes no      14  0
[none]                               Type 3            Custom           yes no  yes      5  0`;
    expect(parsePdffonts(out)).toEqual([
      { name: "NotoSans-Bold", obj: "14" },
      { name: "[none]", obj: "5" },
    ]);
  });
});

// ─── emparejamiento de texto ────────────────────────────────────────────────

describe("matchText", () => {
  const orig = [word("Apoyo", 100, 100), word("EUR", 100, 120), word("EUR", 200, 120)];

  it("clon exacto → todo en su lugar, misma tipografía", () => {
    const cand = [...chars("Apoyo", 100, 100), space(125, 100), ...chars("EUR", 100, 120), ...chars("EUR", 200, 120)];
    const r = matchText(orig, cand, 1.5);
    expect(r).toMatchObject({ matched: 1, missing: 0, extra: 0, typography: 1 });
  });

  it("no depende de cómo el clon agrupe palabras (spans pegados)", () => {
    // "ApoyoEUR" pegado en la misma línea que el original no tenía — igual se encuentra "Apoyo".
    const cand = [...chars("Apoyo", 100, 100), ...chars("EUR", 100, 120), ...chars("EUR", 200, 120)];
    expect(matchText(orig, cand, 1.5).matched).toBe(1);
  });

  it("cada carácter del clon se usa una vez: un solo EUR no alcanza para dos", () => {
    const cand = [...chars("Apoyo", 100, 100), ...chars("EUR", 100, 120)];
    const r = matchText(orig, cand, 1.5);
    expect(r.missing).toBeCloseTo(1 / 3, 4);
    expect(r.misplaced.some((m) => m.word === "EUR" && m.dx == null)).toBe(true);
  });

  it("palabra corrida más allá de la tolerancia → misplaced con dx/dy", () => {
    const cand = [...chars("Apoyo", 104, 100), ...chars("EUR", 100, 120), ...chars("EUR", 200, 120)];
    const r = matchText(orig, cand, 1.5);
    expect(r.matched).toBeCloseTo(2 / 3, 4);
    expect(r.misplaced[0]).toMatchObject({ word: "Apoyo", dx: 4, dy: 0 });
  });

  it("texto inventado → extra", () => {
    const cand = [...chars("Apoyo", 100, 100), ...chars("EUR", 100, 120), ...chars("EUR", 200, 120), ...chars("xx", 300, 300)];
    expect(matchText(orig, cand, 1.5).extra).toBeCloseTo(2 / 13, 4);
  });

  it("no aplana superíndices: m2 no sustituye a m²", () => {
    const r = matchText([word("m²", 100, 100)], chars("m2", 100, 100), 1.5);
    expect(r.missing).toBe(1);
  });

  it("sí iguala ligaduras tipográficas: ﬁ = fi", () => {
    expect(matchText([word("ﬁn", 100, 100)], chars("fin", 100, 100), 1.5).matched).toBe(1);
  });

  it("peso distinto (según descriptor) → typography baja", () => {
    const cand = chars("Apoyo", 100, 100, { weight: 700 });
    const r = matchText([word("Apoyo", 100, 100)], cand, 1.5);
    expect(r.typography).toBe(0);
    expect(r.fontMismatches[0].differs).toContain("weight");
  });

  it("palabra más ancha que el original (espaciado del PDF) → width", () => {
    const wide = chars("Apoyo", 100, 100).map((c, i) => ({ ...c, x: 100 + i * 7, x1: 100 + i * 7 + 4.5 }));
    const r = matchText([word("Apoyo", 100, 100)], wide, 1.5);
    expect(r.fontMismatches[0].differs).toContain("width");
  });
});

describe("fontDiff / familyKey", () => {
  it("fuentes con métricas idénticas cuentan como la misma familia", () => {
    expect(familyKey("Arial-BoldMT")).toBe(familyKey("LiberationSans-Bold"));
    expect(familyKey("BCDEEE+Calibri")).toBe(familyKey("Carlito"));
    expect(familyKey("Inter-Regular")).toBe("inter");
  });
  it("detecta familia, tamaño, peso, cursiva y color", () => {
    const d = fontDiff(F, { family: "Georgia", size: 12, weight: 700, italic: true, color: "#999999" });
    expect(d.sort()).toEqual(["color", "family", "size", "style", "weight"]);
  });
  it("tolera pesos cercanos (400 vs 500) y tamaños redondeados", () => {
    expect(fontDiff(F, { ...F, weight: 500, size: 10.3 })).toEqual([]);
  });
});

// ─── imagen ─────────────────────────────────────────────────────────────────

describe("liveTextShare", () => {
  // Original: fondo blanco con una "línea de texto" negra en (20..80, 20..30) px.
  const ink = (x: number, y: number) => x >= 20 && x < 80 && y >= 20 && y < 30 && (x + y) % 3 !== 0;
  const ref = png(100, 60, (x, y) => (ink(x, y) ? 0 : 255));
  const line = [{ xMin: 20, yMin: 20, xMax: 80, yMax: 30 }];

  it("texto vivo: sin texto, la zona queda como fondo → vivo", async () => {
    const hidden = png(100, 60, () => 255);
    expect((await liveTextShare(ref, hidden, line, 1)).share).toBe(1);
  });

  it("texto horneado: sin texto del DOM la zona sigue igual → horneado", async () => {
    expect((await liveTextShare(ref, ref, line, 1)).share).toBe(0);
  });

  it("imagen corrida 2 px sigue contando como horneada", async () => {
    const shifted = png(100, 60, (x, y) => (ink(x - 2, y - 2) ? 0 : 255));
    expect((await liveTextShare(ref, shifted, line, 1)).share).toBe(0);
  });
});

describe("overflowOf / sameImage / topRegions", () => {
  it("desborde en px CSS según la densidad", () => {
    expect(overflowOf(png(120, 300, () => 255), 100, 200, 2)).toEqual({ x: 10, y: 50 });
    expect(overflowOf(png(100, 201, () => 255), 100, 200, 2)).toEqual({ x: 0, y: 0 });
  });
  it("sameImage", () => {
    const a = png(10, 10, () => 255);
    expect(sameImage(a, a)).toBe(true);
    expect(sameImage(a, png(10, 10, (x) => (x === 3 ? 0 : 255)))).toBe(false);
  });
  it("topRegions ordena por diferencia y es estable", () => {
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
    expect(topRegions(diff)).toEqual(r);
  });
});

// ─── política del HTML y texto en el fuente ─────────────────────────────────

describe("htmlViolations", () => {
  it("un clon estático limpio no tiene violaciones", () => {
    const html = `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><style>.w{position:absolute;color:#000}</style></head><body><span class="w">Hola</span></body></html>`;
    expect(htmlViolations(html)).toEqual([]);
  });
  it("rechaza scripts, handlers, @media, media=, hojas externas, iframes y content con texto", () => {
    const v = htmlViolations(
      `<style>@media print{.a{display:none}} .b::before{content:"hola"}</style>` +
        `<link rel="stylesheet" href="https://evil.example/x.css"><link rel="stylesheet" media="print" href="https://fonts.googleapis.com/a">` +
        `<script>1</script><img src=x onerror="1"><iframe src=x></iframe>`
    ).join(" | ");
    for (const k of ["<script>", "on…=", "@media", "media=", "evil.example", "iframe", "content:"]) expect(v).toContain(k);
  });
  it("hablar de @media en el TEXTO no es violación; content sin letras (viñetas) tampoco", () => {
    expect(htmlViolations(`<style>li::before{content:"•"}</style><p>Usa @media para responsive y onload=</p>`)).toEqual([]);
  });
  it("@import sólo de Google/Bunny Fonts", () => {
    expect(htmlViolations(`<style>@import url("https://fonts.googleapis.com/css2?family=Inter");</style>`)).toEqual([]);
    expect(htmlViolations(`<style>@import url("https://x.example/a.css");</style>`)).toHaveLength(1);
  });
});

describe("sourceText", () => {
  it("quita marcado y espacios, decodifica entidades y conserva palabras partidas por etiquetas", () => {
    const t = sourceText(`<head><title>no</title></head><p>Apo<b>yo</b> &amp; m&sup2; &#8364;5</p><style>.x{}</style>`);
    expect(t).toContain("Apoyo&");
    expect(t).toContain("€5");
    expect(t).toContain("m²");
    expect(t).not.toContain("no");
  });
});

describe("matchText: texto inventado", () => {
  it("letras o números de más quedan en `invented`; signos no", () => {
    const cand = [...chars("Hola", 100, 100), ...chars("94", 100, 200), ...chars("•", 300, 300)];
    const r = matchText([word("Hola", 100, 100)], cand, 1.5);
    expect(r.invented).toBe("94");
  });
});
