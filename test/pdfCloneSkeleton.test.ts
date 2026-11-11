import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSkeleton,
  fixFont,
  genericFamily,
  glyphUnicodeMap,
  letterSpacing,
  lineWords,
  parseToUnicode,
  planFonts,
  resolveWebFont,
  stextLines,
  type FixedFont,
} from "../app/.server/core/pdfCloneSkeleton";
import type { Char } from "../app/.server/core/renderCompare";

const ch = (c: string, x: number, o: Partial<Char> = {}): Char => ({
  c, x, y: 100, x1: x + 5, size: 10, font: "Arial", weight: 400, italic: false, color: "#000000", ...o,
});

describe("stextLines", () => {
  it("corta en los separadores de línea", () => {
    const nl = ch("\n", 0);
    expect(stextLines([ch("a", 0), nl, ch("b", 0), ch("c", 5), nl]).map((l) => l.map((c) => c.c).join(""))).toEqual(["a", "bc"]);
  });
});

describe("lineWords", () => {
  it("corta en espacios, en huecos grandes y en cambios de estilo", () => {
    const line = [
      ch("H", 0), ch("i", 5), ch(" ", 10), ch("y", 15),
      ch("o", 40), // hueco de 20 pt > ¼ del tamaño
      ch("B", 45, { color: "#ff0000" }),
    ];
    expect(lineWords(line).map((w) => w.map((c) => c.c).join(""))).toEqual(["Hi", "y", "o", "B"]);
  });
});

describe("letterSpacing", () => {
  const adv = { [String("1".codePointAt(0))]: 0.5, [String(",".codePointAt(0))]: 0.25 };
  it("no toca palabras con espaciado natural", () => {
    // avance natural 0.5 em × 10 pt = 5 pt
    expect(letterSpacing([ch("1", 0), ch("1", 5)], adv)).toBe("");
  });
  it("mide el espaciado que aplicó el PDF (Tc negativo)", () => {
    // natural 5 + 2.5 = 7.5 pt hasta el último carácter; el PDF lo pone en 6.5 → -0.5 pt por hueco
    expect(letterSpacing([ch("1", 0), ch(",", 4.5), ch("1", 6.5)], adv)).toBe("letter-spacing:-0.67px");
  });
  it("sin avances (fuente sustituida) no adivina", () => {
    expect(letterSpacing([ch("1", 0), ch("1", 9)], undefined)).toBe("");
    expect(letterSpacing([ch("x", 0), ch("1", 9)], adv)).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fuentes incrustadas. Caso que lo motivó: una cotización de Odoo/wkhtmltopdf con
// Lato como CID TrueType SIN tabla cmap. El reparador tronaba, se usaba la fuente
// cruda, Chrome la rechazaba y el clon salía en la serif por defecto sin avisar.
// ─────────────────────────────────────────────────────────────────────────────

describe("parseToUnicode", () => {
  it("lee bfchar y bfrange (con arreglo, con base y con hex partido en líneas)", () => {
    const cmap = `
1 beginbfchar
<0005> <00E9>
endbfchar
2 beginbfrange
<0001> <0003> [<0048> <0045> <
0043>]
<0010> <0012> <0061>
endbfrange`;
    const m = parseToUnicode(cmap);
    expect(m.get(5)).toEqual([0xe9]);
    expect([1, 2, 3].map((c) => String.fromCodePoint(...m.get(c)!)).join("")).toBe("HEC");
    expect([0x10, 0x11, 0x12].map((c) => String.fromCodePoint(...m.get(c)!)).join("")).toBe("abc");
  });
  it("conserva las ligaduras como varios codepoints", () => {
    expect(parseToUnicode("1 beginbfchar\n<0007> <00660069>\nendbfchar").get(7)).toEqual([0x66, 0x69]);
  });
});

describe("glyphUnicodeMap", () => {
  const uni = new Map<number, number[]>([[1, [72]], [2, [0x66, 0x69]], [3, [67]], [0, [0]]]);
  it("con CIDToGIDMap Identity el CID es el glifo; omite ligaduras y .notdef", () => {
    expect(glyphUnicodeMap(uni, null)).toEqual({ "1": 72, "3": 67 });
  });
  it("con stream traduce CID → glifo (2 bytes por CID)", () => {
    const stream = Buffer.from([0, 0, 0, 9, 0, 0, 0, 4]); // cid1→gid9, cid3→gid4
    expect(glyphUnicodeMap(uni, stream)).toEqual({ "9": 72, "4": 67 });
  });
});

describe("resolveWebFont / genericFamily", () => {
  it("misma familia en Google Fonts, sin prefijo de subconjunto ni estilo", () => {
    expect(resolveWebFont("ABCDEF+Lato-Medium")).toEqual({ family: "Lato", known: true });
    expect(resolveWebFont("OpenSans-SemiBoldItalic")).toEqual({ family: "Open Sans", known: true });
    expect(resolveWebFont("ArialMT")).toEqual({ family: "Arimo", known: true });
  });
  it("familia desconocida: lo dice en vez de fingir", () => {
    expect(resolveWebFont("FuenteDeLaCasa-Bold")).toEqual({ family: "Inter", known: false });
  });
  it("la genérica nunca deja caer una sans a la serif por defecto", () => {
    expect(genericFamily("Lato-Medium")).toBe("sans-serif");
    expect(genericFamily("TimesNewRomanPSMT")).toBe("serif");
    expect(genericFamily("CourierNewPSMT")).toBe("monospace");
  });
});

describe("planFonts", () => {
  const cps = (t: string) => new Set([...t].map((c) => c.codePointAt(0)!));
  const good = (t: string): FixedFont => ({ ok: true, buf: Buffer.from("font"), adv: { "72": 0.5 }, cps: [...cps(t)] });
  const used = (name: string, weight: number, t: string) => new Map([[name, { weight, italic: false, cps: cps(t) }]]);

  it("incrustada y completa: @font-face propio, nada sustituido", () => {
    const p = planFonts(used("Lato-Medium", 500, "HEC"), new Map([["Lato-Medium", [good("HEC")]]]));
    expect(p.substituted).toEqual([]);
    expect(p.google).toEqual([]);
    expect(p.faces).toHaveLength(1);
    expect(p.stackOf.get("Lato-Medium")).toBe("'pdf-Lato-Medium-0',sans-serif");
    expect(p.fonts).toEqual([{ name: "Lato-Medium", weight: 500, italic: false, source: "embedded" }]);
  });

  it("la reparación falló: NO usa la fuente cruda; carga la misma familia web y dice por qué", () => {
    const broken: FixedFont = { ok: false, reason: "la fuente incrustada no trae tabla cmap", buf: Buffer.from("raw"), adv: {}, cps: [] };
    const p = planFonts(used("Lato-Medium", 500, "HEC"), new Map([["Lato-Medium", [broken]]]));
    expect(p.faces).toEqual([]);
    expect(p.google).toEqual(["Lato"]);
    expect(p.stackOf.get("Lato-Medium")).toBe("'Lato',sans-serif");
    expect(p.substituted).toHaveLength(1);
    expect(p.substituted[0]).toContain("Lato-Medium → Lato (Google Fonts)");
    expect(p.substituted[0]).toContain("no trae tabla cmap");
    expect(p.fonts[0]).toMatchObject({ source: "web", webFamily: "Lato", weight: 500 });
  });

  it("sin archivo y sin familia conocida: fallback explícito", () => {
    const p = planFonts(used("FuenteDeLaCasa-Bold", 700, "A"), new Map());
    expect(p.fonts[0]).toMatchObject({ source: "fallback", webFamily: "Inter" });
    expect(p.substituted[0]).toMatch(/no hay "FuenteDeLaCasa" en Google Fonts/);
  });

  it("incrustada pero le faltan glifos: respaldo web y aviso con los caracteres", () => {
    const p = planFonts(used("Lato-Bold", 700, "HEñ"), new Map([["Lato-Bold", [good("HE")]]]));
    expect(p.stackOf.get("Lato-Bold")).toBe("'pdf-Lato-Bold-0','Lato',sans-serif");
    expect(p.substituted[0]).toContain("1 carácter(es): ñ");
    expect(p.fonts[0]).toMatchObject({ source: "embedded", webFamily: "Lato" });
  });
});

// ── De punta a punta con un PDF sintético: fuente CID TrueType sin cmap ni post.
// Necesita mutool, pdffonts y fontTools (producción los trae; el CI de verify no).
process.env.PATH ||= "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const toolsOk =
  has("mutool", ["-v"]) && has("pdffonts", ["-v"]) && has("python3", ["-I", "-c", "import fontTools.fontBuilder"]);

/** Fuente de 3 glifos (.notdef, A, B) con las tablas que deja wkhtmltopdf: sin cmap ni post. */
const MAKE_FONT_PY = `
import sys, io
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
def box(w):
    pen = TTGlyphPen(None)
    pen.moveTo((50, 0)); pen.lineTo((50, 700)); pen.lineTo((w, 700)); pen.lineTo((w, 0)); pen.closePath()
    return pen.glyph()
fb = FontBuilder(1000, isTTF=True)
order = [".notdef", "A", "B"]
fb.setupGlyphOrder(order)
fb.setupCharacterMap({65: "A", 66: "B"})
fb.setupGlyf({".notdef": box(400), "A": box(500), "B": box(300)})
fb.setupHorizontalMetrics({".notdef": (500, 50), "A": (600, 50), "B": (400, 50)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Demo", "styleName": "Medium"})
fb.setupOS2()
fb.setupPost()
f = fb.font
if sys.argv[1] == "strip":
    del f["cmap"]; del f["post"]
out = io.BytesIO(); f.save(out)
sys.stdout.buffer.write(out.getvalue())
`;
const makeFont = (mode: "strip" | "full") =>
  execFileSync("python3", ["-I", "-c", MAKE_FONT_PY, mode], { maxBuffer: 8 * 1024 * 1024 });

/** PDF mínimo: una página que dibuja «AB BA» con la fuente Type0 (Identity-H, CID = glifo). */
function syntheticPdf(font: Buffer, toUnicode: boolean): Buffer {
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
1 beginbfrange
<0001> <0002> [<0041> <0042>]
endbfrange
endcmap CMapName currentdict /CMap defineresource pop end end`;
  const content = "BT /F1 24 Tf 72 700 Td <00010002> Tj 40 0 Td <00020001> Tj ET";
  const stream = (dict: string, body: Buffer | string) => {
    const b = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
    return Buffer.concat([Buffer.from(`<< ${dict} /Length ${b.length} >>\nstream\n`), b, Buffer.from("\nendstream")]);
  };
  const objs: (Buffer | string)[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    stream("", content),
    `<< /Type /Font /Subtype /Type0 /BaseFont /Demo-Medium /Encoding /Identity-H /DescendantFonts [6 0 R]${toUnicode ? " /ToUnicode 9 0 R" : ""} >>`,
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Demo-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap /Identity /W [0 [500 600 400]] >>",
    "<< /Type /FontDescriptor /FontName /QWAAAA+Demo-Medium /Flags 4 /FontBBox [0 -200 700 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>",
    stream(`/Length1 ${font.length}`, font),
    stream("", cmap),
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let pos = chunks[0].length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o, "latin1"), Buffer.from("\nendobj\n")]);
    offsets.push(pos);
    pos += b.length;
    chunks.push(b);
  });
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  return Buffer.concat([...chunks, Buffer.from(xref)]);
}

describe.skipIf(!toolsOk)("buildSkeleton con fuente CID sin cmap (PDF sintético)", () => {
  const withPdf = async <T,>(pdf: Buffer, fn: (p: string) => Promise<T>) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "skel-test-"));
    try {
      const p = path.join(dir, "t.pdf");
      writeFileSync(p, pdf);
      return await fn(p);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("fixFont reconstruye el cmap desde el mapa glifo → unicode", async () => {
    const fixed = await fixFont(makeFont("strip"), "Demo-Medium", 500, false, { "1": 65, "2": 66 });
    expect(fixed.ok).toBe(true);
    expect(fixed.cps).toEqual([65, 66]);
    expect(fixed.adv["65"]).toBeCloseTo(0.6);
    // La fuente resultante ya trae las tablas que Chrome exige.
    const tables = execFileSync(
      "python3",
      ["-I", "-c", "import sys,io\nfrom fontTools.ttLib import TTFont\nf=TTFont(io.BytesIO(sys.stdin.buffer.read()))\nprint(' '.join(sorted(f.keys())), f.getBestCmap()[65], f['OS/2'].usWeightClass)"],
      { input: fixed.buf }
    ).toString();
    expect(tables).toContain("cmap");
    expect(tables).toContain("post");
    expect(tables.trim().endsWith("A 500")).toBe(true);
  });

  it("sin cmap y sin mapa: falla con motivo, no devuelve la fuente cruda como buena", async () => {
    const fixed = await fixFont(makeFont("strip"), "Demo-Medium", 500, false);
    expect(fixed.ok).toBe(false);
    expect(fixed.reason).toMatch(/cmap/);
  });

  it("una fuente normal (con cmap) sigue pasando igual", async () => {
    const fixed = await fixFont(makeFont("full"), "Demo-Medium", 500, false);
    expect(fixed.ok).toBe(true);
    expect(fixed.cps).toEqual([65, 66]);
  });

  it("el clon usa la fuente del PDF: familia y peso reales, nada sustituido", async () => {
    const sk = await withPdf(syntheticPdf(makeFont("strip"), true), (p) => buildSkeleton(p, 1));
    expect(sk.words).toBe(2);
    expect(sk.substituted).toEqual([]);
    expect(sk.fonts).toEqual([{ name: "Demo-Medium", weight: 500, italic: false, source: "embedded" }]);
    expect(sk.css).toContain('@font-face{font-family:"pdf-Demo-Medium-0"');
    expect(sk.html).toContain("font-family:'pdf-Demo-Medium-0',sans-serif");
    expect(sk.html).toContain("font-weight:500");
    expect(sk.css).not.toContain("fonts.googleapis.com");
  }, 30_000);

  it("sin /ToUnicode no se puede reconstruir: lo reporta y no declara la fuente rota", async () => {
    const sk = await withPdf(syntheticPdf(makeFont("strip"), false), (p) => buildSkeleton(p, 1));
    expect(sk.css).not.toContain("@font-face");
    expect(sk.fonts.every((f) => f.source !== "embedded")).toBe(true);
    expect(sk.substituted.length).toBeGreaterThan(0);
  }, 30_000);
});
