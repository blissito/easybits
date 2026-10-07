/**
 * Esqueleto determinista de un clon PDF→HTML (patrón SlideCoder: al modelo no se
 * le piden coordenadas, se le dan).
 *
 * Todo sale del PDF, sin LLM:
 *   - texto: MuPDF stext → una línea = un contenedor anclado a su LÍNEA BASE, y
 *     cada palabra en su origen exacto dentro de la línea (no se depende de que
 *     el ancho de la fuente en Chrome coincida con el del PDF);
 *   - fuentes: las incrustadas en el PDF, como @font-face con data URL (misma
 *     forma de glifo y mismo nombre al imprimirse); Type 3 o sin archivo → una
 *     equivalente de Google Fonts;
 *   - fondo: la página rasterizada SIN texto (`mutool draw -K`). El texto queda
 *     vivo encima; el fondo no lleva letras, así que no es "texto horneado".
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  familyKey,
  parsePdffonts,
  rasterize,
  readStext,
  showObjects,
  type Char,
} from "./renderCompare";

const execFileAsync = promisify(execFile);
const PT_TO_CSS = 4 / 3;
/** Fondo a 2× del tamaño CSS: nítido en pantalla y en impresión. */
const BG_SCALE = 2;

export interface Skeleton {
  /** Contenido interior de la página (va dentro del root de `buildCloneDocument`). */
  html: string;
  /** CSS de fuentes (@font-face / @import de Google Fonts). */
  css: string;
  cssW: number;
  cssH: number;
  /** Palabras colocadas (pocas = página escaneada). */
  words: number;
  /** Fuentes que no se pudieron incrustar (se usó una equivalente). */
  substituted: string[];
}

/** Equivalentes en Google Fonts para lo que no trae archivo (Type 3, no incrustada). */
const GOOGLE_EQUIV: Record<string, string> = {
  arial: "Arimo",
  times: "Tinos",
  courier: "Cousine",
  calibri: "Carlito",
  cambria: "Caladea",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (pt: number) => Math.round(pt * PT_TO_CSS * 100) / 100;
const cssName = (name: string) => `pdf-${name.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/**
 * Archivos de fuente incrustados por nombre (sin prefijo de subconjunto). Un mismo
 * nombre puede tener varios subconjuntos con glifos distintos: se devuelven todos.
 */
async function embeddedFonts(pdfPath: string, page: number): Promise<Map<string, Buffer[]>> {
  const out = new Map<string, Buffer[]>();
  const { stdout } = await execFileAsync("pdffonts", ["-f", String(page), "-l", String(page), pdfPath], { timeout: 30_000 });
  const fonts = parsePdffonts(stdout);
  const dicts = await showObjects(pdfPath, fonts.map((f) => f.obj));
  // Type0 → el descriptor vive en la fuente descendiente.
  const kidOf = new Map<string, string>();
  for (const [obj, body] of dicts) {
    const k = body.match(/\/DescendantFonts\s*\[\s*(\d+) 0 R/)?.[1];
    if (k) kidOf.set(obj, k);
  }
  const kids = await showObjects(pdfPath, [...new Set(kidOf.values())]);
  const descOf = new Map<string, string>();
  for (const f of fonts) {
    const body = kidOf.has(f.obj) ? kids.get(kidOf.get(f.obj)!) : dicts.get(f.obj);
    const d = body?.match(/\/FontDescriptor (\d+) 0 R/)?.[1];
    if (d) descOf.set(f.obj, d);
  }
  const descs = await showObjects(pdfPath, [...new Set(descOf.values())]);
  for (const f of fonts) {
    const body = descs.get(descOf.get(f.obj) ?? "") ?? "";
    // Sólo TrueType/OpenType (FontFile2, o FontFile3 /OpenType): Chrome no carga CFF ni Type 1 sueltos.
    const file = body.match(/\/FontFile2 (\d+) 0 R/)?.[1];
    if (!file) continue;
    const name = (body.match(/\/FontName \/([^\s/<>\[\]]+)/)?.[1] ?? f.name).replace(/^[A-Z]{6}\+/, "");
    try {
      const { stdout: bytes } = await execFileAsync("mutool", ["show", "-b", pdfPath, file], {
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "buffer",
      });
      const buf = bytes as unknown as Buffer;
      if (buf.length < 12) continue;
      if (!out.has(name)) out.set(name, []);
      out.get(name)!.push(buf);
    } catch {
      // sin archivo legible: cae a la equivalente
    }
  }
  return out;
}

/**
 * Fuentes extraídas de un PDF que Chrome no acepta tal cual: subconjuntos sin
 * nombre de familia (Chrome las imprime como "OTS-derived-font" y la tipografía
 * no coincide) o con tablas que su saneador (OTS) rechaza (la fuente no carga y
 * cae a Times). fontTools reescribe la tabla name con el nombre del descriptor y
 * quita lo que no hace falta para dibujar (hinting, STAT, VDMX, hdmx). También
 * limpia el campo `language` del cmap, que algunos subconjuntos traen con basura.
 */
const FIX_FONT_PY = `
import sys, io, json, base64
from fontTools.ttLib import TTFont
name, weight, italic = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "1"
f = TTFont(io.BytesIO(sys.stdin.buffer.read()))
for t in ("STAT", "VDMX", "hdmx", "fpgm", "prep", "cvt ", "gasp", "LTSH", "DSIG"):
    if t in f: del f[t]
# Subconjuntos con "language" basura en el cmap formato 12: OTS rechaza la tabla entera.
for t in f["cmap"].tables:
    t.language = 0
fam = name.split("-")[0]
sub = ("Bold " if weight >= 600 else "") + ("Italic" if italic else "")
sub = sub.strip() or "Regular"
nt = f["name"]
nt.names = [n for n in nt.names if n.nameID > 6]
for nid, val in ((1, fam), (2, sub), (4, fam + " " + sub), (6, name)):
    nt.setName(val, nid, 3, 1, 0x409)
    nt.setName(val, nid, 1, 0, 0)
if "OS/2" in f:
    f["OS/2"].usWeightClass = weight
# Avance de cada carácter (en em): con él se calcula el letter-spacing que el PDF
# aplicó (Tc/Tw) y Chrome no conoce.
upm = f["head"].unitsPerEm
hm = f["hmtx"]
adv = {str(cp): hm[g][0] / upm for cp, g in f.getBestCmap().items() if g in hm.metrics}
out = io.BytesIO(); f.save(out)
sys.stdout.write(json.dumps({"font": base64.b64encode(out.getvalue()).decode(), "adv": adv}))
`;

interface FixedFont {
  buf: Buffer;
  /** codepoint → avance en em. */
  adv: Record<string, number>;
}

async function fixFont(buf: Buffer, name: string, weight: number, italic: boolean): Promise<FixedFont> {
  return new Promise((resolve) => {
    const child = execFile(
      "python3",
      ["-I", "-c", FIX_FONT_PY, name, String(weight), italic ? "1" : "0"],
      { timeout: 30_000, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" },
      (err, stdout) => {
        try {
          if (err) throw err;
          const j = JSON.parse(String(stdout));
          resolve({ buf: Buffer.from(j.font, "base64"), adv: j.adv });
        } catch {
          resolve({ buf, adv: {} });
        }
      }
    );
    child.stdin?.end(buf);
  });
}

/** Palabras de una línea: cortes en espacios y en huecos mayores a ¼ del tamaño. */
export function lineWords(chars: Char[]): Char[][] {
  const words: Char[][] = [];
  let cur: Char[] = [];
  const flush = () => {
    if (cur.length) words.push(cur);
    cur = [];
  };
  for (const ch of chars) {
    if (/^\s*$/.test(ch.c)) {
      flush();
      continue;
    }
    const prev = cur[cur.length - 1];
    if (
      prev &&
      (ch.x - prev.x1 > Math.max(ch.size, 1) * 0.25 ||
        ch.font !== prev.font ||
        ch.size !== prev.size ||
        ch.color !== prev.color)
    ) {
      flush();
    }
    cur.push(ch);
  }
  flush();
  return words;
}

/**
 * Espaciado que el PDF metió entre letras (Tc, o palabras comprimidas en tablas):
 * se compara el origen del último carácter en el PDF contra donde caería con los
 * avances naturales de la fuente. Sin avances (fuente sustituida) no se toca.
 */
export function letterSpacing(w: Char[], adv: Record<string, number> | undefined): string {
  if (!adv || w.length < 2) return "";
  let natural = 0;
  for (const ch of w.slice(0, -1)) {
    const a = adv[String(ch.c.codePointAt(0))];
    if (a == null) return "";
    natural += a * ch.size;
  }
  const real = w[w.length - 1].x - w[0].x;
  const ls = (real - natural) / (w.length - 1);
  return Math.abs(ls) < 0.05 ? "" : `letter-spacing:${px(ls)}px`;
}

/** Líneas del stext: los chars vienen separados por "\n" en cada <line>. */
export function stextLines(chars: Char[]): Char[][] {
  const lines: Char[][] = [];
  let cur: Char[] = [];
  for (const ch of chars) {
    if (ch.c === "\n") {
      if (cur.length) lines.push(cur);
      cur = [];
    } else cur.push(ch);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export async function buildSkeleton(pdfPath: string, page: number): Promise<Skeleton> {
  const st = await readStext(pdfPath, page);
  const cssW = Math.round(st.width * PT_TO_CSS);
  const cssH = Math.round(st.height * PT_TO_CSS);

  // ── fuentes
  const files = await embeddedFonts(pdfPath, page).catch(() => new Map<string, Buffer[]>());
  const used = new Set(st.chars.filter((c) => c.font).map((c) => c.font.replace(/^[A-Z]{6}\+/, "")));
  const faces: string[] = [];
  const google = new Set<string>();
  const substituted: string[] = [];
  const stackOf = new Map<string, string>();
  const advOf = new Map<string, Record<string, number>>();
  for (const name of used) {
    const sample = st.chars.find((c) => c.font.replace(/^[A-Z]{6}\+/, "") === name);
    const weight = sample?.weight ?? (/bold|black|heavy/i.test(name) ? 700 : 400);
    const italic = sample?.italic ?? /italic|oblique/i.test(name);
    const raw = files.get(name);
    const bufs = raw && (await Promise.all(raw.map((b) => fixFont(b, name, weight, italic))));
    if (bufs?.length) {
      // Varios subconjuntos con el mismo nombre: gana el primero que trae el carácter (= el orden del stack).
      advOf.set(name, Object.assign({}, ...[...bufs].reverse().map((b) => b.adv)));
      const fams = bufs.map(({ buf: b }, i) => {
        const fam = `${cssName(name)}-${i}`;
        faces.push(`@font-face{font-family:"${fam}";src:url(data:font/ttf;base64,${b.toString("base64")}) format("truetype");}`);
        return `'${fam}'`;
      });
      stackOf.set(name, fams.join(","));
    } else {
      const eq = GOOGLE_EQUIV[familyKey(name)] ?? "Inter";
      google.add(eq);
      substituted.push(`${name} → ${eq}`);
      stackOf.set(name, `'${eq}'`);
    }
  }
  const imports = google.size
    ? `@import url("https://fonts.googleapis.com/css2?${[...google]
        .map((g) => `family=${g.replace(/ /g, "+")}:ital,wght@0,400;0,700;1,400;1,700`)
        .join("&")}&display=block");`
    : "";

  // ── texto: una línea = contenedor anclado a su línea base; palabras en su origen
  const parts: string[] = [];
  let words = 0;
  for (const line of stextLines(st.chars)) {
    const lw = lineWords(line);
    if (!lw.length) continue;
    words += lw.length;
    const x0 = lw[0][0].x;
    const y0 = lw[0][0].y;
    const spans = lw.map((w) => {
      const c = w[0];
      const name = c.font.replace(/^[A-Z]{6}\+/, "");
      const weight = c.weight ?? (/bold|black|heavy/i.test(name) ? 700 : 400);
      const italic = c.italic ?? /italic|oblique/i.test(name);
      // Cada palabra se ancla a SU línea base (sub/superíndices, cambios de tamaño).
      const style = [
        `left:${px(c.x - x0)}px`,
        `top:${px(c.y - y0)}px`,
        `font-family:${stackOf.get(name) ?? "sans-serif"}`,
        `font-size:${px(c.size)}px`,
        `font-weight:${weight}`,
        italic ? "font-style:italic" : "",
        `color:${c.color}`,
        letterSpacing(w, advOf.get(name)),
      ].filter(Boolean).join(";");
      return `<span class="w" style="${style}">${esc(w.map((ch) => ch.c).join(""))}</span>`;
    });
    parts.push(`<div class="l" style="left:${px(x0)}px;top:${px(y0)}px">${spans.join(" ")}</div>`);
  }

  // ── fondo sin texto
  const bg = await rasterize(pdfPath, page, cssW * BG_SCALE, true);
  const html =
    `<img class="bg" alt="" src="data:image/png;base64,${bg.toString("base64")}">` + parts.join("");

  // .l: origen de la línea en su línea base (caja de 0×0). .w: `text-box` recorta
  // la caja de la palabra justo en su línea base alfabética y `bottom:0` la apoya
  // en el ancla → la línea base cae exactamente en `top`, sin depender del
  // ascent/descent de la fuente (Chromium ≥ 133).
  const css =
    imports +
    faces.join("") +
    `.bg{position:absolute;left:0;top:0;width:${cssW}px;height:${cssH}px}` +
    `.l{position:absolute;width:0;height:0}` +
    `.w{position:absolute;white-space:pre;line-height:1;font-kerning:none;font-variant-ligatures:none;text-box:trim-end text alphabetic;transform:translateY(-100%)}`;

  return { html, css, cssW, cssH, words, substituted };
}
