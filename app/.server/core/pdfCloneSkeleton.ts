/**
 * Esqueleto determinista de un clon PDF→HTML (patrón SlideCoder: al modelo no se
 * le piden coordenadas, se le dan).
 *
 * Todo sale del PDF, sin LLM:
 *   - texto: MuPDF stext → una línea = un contenedor anclado a su LÍNEA BASE, y
 *     cada palabra en su origen exacto dentro de la línea (no se depende de que
 *     el ancho de la fuente en Chrome coincida con el del PDF);
 *   - fuentes: las incrustadas en el PDF, como @font-face con data URL (misma
 *     forma de glifo y mismo nombre al imprimirse). Un subconjunto CID sin tabla
 *     cmap (wkhtmltopdf/Odoo, Qt) se completa con el /ToUnicode del PDF. Type 3,
 *     CFF o sin archivo → la misma familia en Google Fonts si existe, y si no una
 *     equivalente; todo lo que no quedó incrustado se REPORTA (`fonts`,
 *     `substituted`), nunca cae en silencio a la serif del navegador;
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
  weightFromName,
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
  /** Fuentes que no quedaron (o no del todo) incrustadas, con el motivo. */
  substituted: string[];
  /** Qué se usó para cada fuente del PDF. */
  fonts: FontReport[];
}

export interface FontReport {
  /** Nombre en el PDF, sin prefijo de subconjunto ("Lato-Medium"). */
  name: string;
  weight: number;
  italic: boolean;
  /**
   * embedded = el archivo del PDF (glifos idénticos); web = la misma familia desde
   * Google Fonts; fallback = no se pudo resolver y se usó otra familia.
   */
  source: "embedded" | "web" | "fallback";
  /** Familia de Google Fonts cargada como sustituto o respaldo. */
  webFamily?: string;
  /** Por qué no quedó (del todo) incrustada. */
  note?: string;
}

/**
 * Familias que sirve Google Fonts, por `familyKey` (minúsculas, sin estilo). Las
 * cinco primeras son equivalentes métricos de fuentes de sistema que no se pueden
 * redistribuir. Todas comprobadas contra css2 el 2026-11-11 con el eje que se pide
 * abajo (Google ignora el itálico en las familias que no lo tienen).
 */
const GOOGLE_FAMILIES: Record<string, string> = {
  arial: "Arimo",
  times: "Tinos",
  courier: "Cousine",
  calibri: "Carlito",
  cambria: "Caladea",
  lato: "Lato",
  roboto: "Roboto",
  robotoslab: "Roboto Slab",
  robotomono: "Roboto Mono",
  opensans: "Open Sans",
  montserrat: "Montserrat",
  inter: "Inter",
  poppins: "Poppins",
  sourcesanspro: "Source Sans 3",
  sourcesans3: "Source Sans 3",
  sourceserifpro: "Source Serif 4",
  sourceserif4: "Source Serif 4",
  sourcecodepro: "Source Code Pro",
  notosans: "Noto Sans",
  notoserif: "Noto Serif",
  raleway: "Raleway",
  nunito: "Nunito",
  nunitosans: "Nunito Sans",
  merriweather: "Merriweather",
  playfairdisplay: "Playfair Display",
  oswald: "Oswald",
  ubuntu: "Ubuntu",
  ptsans: "PT Sans",
  ptserif: "PT Serif",
  worksans: "Work Sans",
  dmsans: "DM Sans",
  firasans: "Fira Sans",
  ibmplexsans: "IBM Plex Sans",
  barlow: "Barlow",
  rubik: "Rubik",
  mulish: "Mulish",
  quicksand: "Quicksand",
  karla: "Karla",
  manrope: "Manrope",
  librebaskerville: "Libre Baskerville",
  librefranklin: "Libre Franklin",
  lora: "Lora",
  ebgaramond: "EB Garamond",
  bitter: "Bitter",
  cabin: "Cabin",
  josefinsans: "Josefin Sans",
  titilliumweb: "Titillium Web",
  heebo: "Heebo",
  archivo: "Archivo",
  spacegrotesk: "Space Grotesk",
  dosis: "Dosis",
  outfit: "Outfit",
  plusjakartasans: "Plus Jakarta Sans",
  figtree: "Figtree",
  urbanist: "Urbanist",
  sora: "Sora",
};
/** Lo que se carga cuando la familia no está en Google Fonts (se reporta como `fallback`). */
const LAST_RESORT_FAMILY = "Inter";

/**
 * Familia web para una fuente del PDF: la misma si Google Fonts la tiene (o su
 * equivalente métrico), y si no la de último recurso con `known: false`.
 */
export function resolveWebFont(name: string): { family: string; known: boolean } {
  const family = GOOGLE_FAMILIES[familyKey(name)];
  return family ? { family, known: true } : { family: LAST_RESORT_FAMILY, known: false };
}

/** Genérica al final del stack: si algo no carga, que al menos no sea la serif por defecto. */
export function genericFamily(name: string): "serif" | "monospace" | "sans-serif" {
  if (/mono|courier|consol|code/i.test(name)) return "monospace";
  if (/sans/i.test(name)) return "sans-serif";
  if (/serif|times|garamond|georgia|baskerville|cambria|merriweather|playfair|lora|bitter|tinos|caladea|roman|minion|palatino|bodoni|didot/i.test(name)) return "serif";
  return "sans-serif";
}

/**
 * /ToUnicode de una fuente (CMap) → código/CID → codepoints. Sólo `bfchar` y
 * `bfrange`; los destinos son UTF-16BE en hex. Los `<…>` pueden venir partidos en
 * varias líneas.
 */
export function parseToUnicode(cmap: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const hex = (h: string) => h.replace(/\s+/g, "");
  const decode = (h: string): number[] => {
    const clean = hex(h);
    const units: number[] = [];
    for (let i = 0; i + 4 <= clean.length; i += 4) units.push(parseInt(clean.slice(i, i + 4), 16));
    return [...String.fromCharCode(...units)].map((c) => c.codePointAt(0)!);
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g)) {
      out.set(parseInt(hex(m[1]), 16), decode(m[2]));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f\s]+>)/g)) {
      const lo = parseInt(hex(m[1]), 16);
      const hi = parseInt(hex(m[2]), 16);
      if (!(hi >= lo) || hi - lo > 0xffff) continue;
      if (m[3].startsWith("[")) {
        const dsts = [...m[3].matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((d) => decode(d[1]));
        for (let i = 0; i <= hi - lo && i < dsts.length; i++) out.set(lo + i, dsts[i]);
      } else {
        const base = decode(m[3].slice(1, -1));
        if (!base.length) continue;
        // El rango incrementa el ÚLTIMO codepoint del destino.
        for (let i = 0; i <= hi - lo; i++) out.set(lo + i, [...base.slice(0, -1), base[base.length - 1] + i]);
      }
    }
  }
  return out;
}

/**
 * Glifo → codepoint para una fuente CID: el /ToUnicode da CID → texto y el
 * /CIDToGIDMap (Identity o un stream de 2 bytes por CID) da CID → glifo. Los
 * destinos de varios caracteres (ligaduras) no caben en un cmap y se omiten.
 */
export function glyphUnicodeMap(toUnicode: Map<number, number[]>, cidToGid: Buffer | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [cid, cps] of toUnicode) {
    if (cps.length !== 1 || cps[0] <= 0) continue;
    const gid = cidToGid ? (cid * 2 + 1 < cidToGid.length ? cidToGid.readUInt16BE(cid * 2) : 0) : cid;
    if (gid > 0 && !(String(gid) in map)) map[String(gid)] = cps[0];
  }
  return map;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (pt: number) => Math.round(pt * PT_TO_CSS * 100) / 100;
const cssName = (name: string) => `pdf-${name.replace(/[^A-Za-z0-9_-]/g, "_")}`;

interface EmbeddedFont {
  buf: Buffer;
  /** glifo → codepoint, del /ToUnicode (sólo fuentes CID). Vacío si no aplica. */
  glyphMap: Record<string, number>;
}

async function showStream(pdfPath: string, obj: string): Promise<Buffer> {
  const { stdout } = await execFileAsync("mutool", ["show", "-b", pdfPath, obj], {
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "buffer",
  });
  return stdout as unknown as Buffer;
}

/**
 * Archivos de fuente incrustados por nombre (sin prefijo de subconjunto). Un mismo
 * nombre puede tener varios subconjuntos con glifos distintos: se devuelven todos.
 */
async function embeddedFonts(pdfPath: string, page: number): Promise<Map<string, EmbeddedFont[]>> {
  const out = new Map<string, EmbeddedFont[]>();
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
      const buf = await showStream(pdfPath, file);
      if (buf.length < 12) continue;
      // Fuente CID (Type0): el PDF dibuja por número de glifo y el archivo suele
      // venir SIN cmap; el texto sólo se recupera del /ToUnicode.
      let glyphMap: Record<string, number> = {};
      const kid = kidOf.get(f.obj);
      const toUni = kid ? dicts.get(f.obj)?.match(/\/ToUnicode (\d+) 0 R/)?.[1] : undefined;
      if (kid && toUni) {
        try {
          const gidRef = kids.get(kid)?.match(/\/CIDToGIDMap (\d+) 0 R/)?.[1];
          const cidToGid = gidRef ? await showStream(pdfPath, gidRef) : null;
          glyphMap = glyphUnicodeMap(parseToUnicode((await showStream(pdfPath, toUni)).toString("latin1")), cidToGid);
        } catch {
          // sin /ToUnicode legible: la fuente se usa sólo si ya trae cmap
        }
      }
      if (!out.has(name)) out.set(name, []);
      out.get(name)!.push({ buf, glyphMap });
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
 *
 * Los subconjuntos CID (wkhtmltopdf/Odoo, Qt) llegan SIN tabla cmap ni post: el PDF
 * dibuja por número de glifo. Chrome rechaza esa fuente entera y pinta con la serif
 * por defecto. Aquí se reconstruye el cmap con el mapa glifo → codepoint del
 * /ToUnicode (primera línea de stdin, JSON) y se agrega un post mínimo.
 *
 * Nunca truena: si la fuente no queda utilizable imprime {"error": …} y quien llama
 * usa una fuente web y lo reporta.
 */
const FIX_FONT_PY = `
import sys, io, json, base64
def main():
    from fontTools.ttLib import TTFont, newTable
    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
    name, weight, italic = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "1"
    data = sys.stdin.buffer.read()
    nl = data.index(b"\\n")
    gmap = json.loads(data[:nl] or b"{}")
    f = TTFont(io.BytesIO(data[nl + 1:]))
    for t in ("STAT", "VDMX", "hdmx", "fpgm", "prep", "cvt ", "gasp", "LTSH", "DSIG"):
        if t in f: del f[t]
    if "OS/2" not in f:
        raise Exception("la fuente incrustada no trae tabla OS/2")
    order = f.getGlyphOrder()
    best = (f.getBestCmap() or {}) if "cmap" in f else {}
    cm = dict(best)
    for gid, cp in gmap.items():
        gid = int(gid)
        if cp not in cm and 0 < gid < len(order):
            cm[cp] = order[gid]
    if not cm:
        raise Exception("la fuente incrustada no trae tabla cmap y el PDF no trae /ToUnicode para reconstruirla")
    if "cmap" not in f or len(cm) != len(best):
        table = newTable("cmap")
        table.tableVersion = 0
        table.tables = []
        bmp = {c: g for c, g in cm.items() if c <= 0xFFFF}
        if bmp:
            s4 = CmapSubtable.newSubtable(4)
            s4.platformID, s4.platEncID, s4.language, s4.cmap = 3, 1, 0, bmp
            table.tables.append(s4)
        if len(bmp) != len(cm):
            s12 = CmapSubtable.newSubtable(12)
            s12.platformID, s12.platEncID, s12.language, s12.cmap = 3, 10, 0, dict(cm)
            table.tables.append(s12)
        f["cmap"] = table
    # Subconjuntos con "language" basura en el cmap formato 12: OTS rechaza la tabla entera.
    for t in f["cmap"].tables:
        t.language = 0
    if "post" not in f:
        post = newTable("post")
        post.formatType = 3.0
        post.italicAngle = 0
        post.underlinePosition = -75
        post.underlineThickness = 50
        post.isFixedPitch = 0
        post.minMemType42 = post.maxMemType42 = post.minMemType1 = post.maxMemType1 = 0
        post.extraNames = []
        post.mapping = {}
        f["post"] = post
    if "name" not in f:
        f["name"] = newTable("name")
        f["name"].names = []
    fix_names(f, name, weight, italic)
    # Avance de cada carácter (en em): con él se calcula el letter-spacing que el PDF
    # aplicó (Tc/Tw) y Chrome no conoce.
    upm = f["head"].unitsPerEm
    hm = f["hmtx"]
    adv = {str(cp): hm[g][0] / upm for cp, g in cm.items() if g in hm.metrics}
    out = io.BytesIO(); f.save(out)
    return {"font": base64.b64encode(out.getvalue()).decode(), "adv": adv, "cps": sorted(cm.keys())}

def fix_names(f, name, weight, italic):
    fam = name.split("-")[0]
    sub = ("Bold " if weight >= 600 else "") + ("Italic" if italic else "")
    sub = sub.strip() or "Regular"
    nt = f["name"]
    nt.names = [n for n in nt.names if n.nameID > 6]
    for nid, val in ((1, fam), (2, sub), (4, fam + " " + sub), (6, name)):
        nt.setName(val, nid, 3, 1, 0x409)
        nt.setName(val, nid, 1, 0, 0)
    f["OS/2"].usWeightClass = weight

try:
    res = main()
except Exception as e:
    res = {"error": str(e) or type(e).__name__}
sys.stdout.write(json.dumps(res))
`;

export interface FixedFont {
  /** false = no quedó utilizable en el navegador; `reason` dice por qué. */
  ok: boolean;
  reason?: string;
  buf: Buffer;
  /** codepoint → avance en em. */
  adv: Record<string, number>;
  /** Codepoints que la fuente reparada sabe dibujar. */
  cps: number[];
}

export async function fixFont(
  buf: Buffer,
  name: string,
  weight: number,
  italic: boolean,
  glyphMap: Record<string, number> = {}
): Promise<FixedFont> {
  // Sin reparar no se usa: un subconjunto sin cmap no carga en Chrome y el texto
  // caería a la serif por defecto sin que nadie se entere.
  const failed = (reason: string): FixedFont => ({ ok: false, reason, buf, adv: {}, cps: [] });
  return new Promise((resolve) => {
    const child = execFile(
      "python3",
      ["-I", "-c", FIX_FONT_PY, name, String(weight), italic ? "1" : "0"],
      { timeout: 30_000, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" },
      (err, stdout) => {
        try {
          if (err) throw err;
          const j = JSON.parse(String(stdout));
          if (j.error) return resolve(failed(String(j.error)));
          resolve({ ok: true, buf: Buffer.from(j.font, "base64"), adv: j.adv, cps: j.cps ?? [] });
        } catch (e) {
          resolve(failed(`no se pudo reparar la fuente incrustada (${((e as Error).message || "error").split("\n")[0].slice(0, 160)})`));
        }
      }
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(Buffer.concat([Buffer.from(JSON.stringify(glyphMap) + "\n"), buf]));
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

export interface FontPlan {
  /** nombre en el PDF → stack CSS completo. */
  stackOf: Map<string, string>;
  advOf: Map<string, Record<string, number>>;
  /** Reglas @font-face con las fuentes incrustadas. */
  faces: string[];
  /** Familias a cargar de Google Fonts. */
  google: string[];
  substituted: string[];
  fonts: FontReport[];
}

/**
 * Decide con qué se pinta cada fuente del PDF. Una incrustada se usa sólo si quedó
 * reparada; si le faltan glifos para el texto de la página, o no hay archivo, entra
 * la familia web y SIEMPRE se anota en `substituted` con el motivo.
 */
export function planFonts(
  used: Map<string, { weight: number; italic: boolean; cps: Set<number> }>,
  fixedOf: Map<string, FixedFont[]>
): FontPlan {
  const plan: FontPlan = { stackOf: new Map(), advOf: new Map(), faces: [], google: [], substituted: [], fonts: [] };
  const google = new Set<string>();
  for (const [name, u] of used) {
    const all = fixedOf.get(name) ?? [];
    const good = all.filter((f) => f.ok);
    const web = resolveWebFont(name);
    const webLabel = web.known ? `${web.family} (Google Fonts)` : `${web.family} (no hay "${name.split("-")[0]}" en Google Fonts: tipografía distinta)`;
    const generic = genericFamily(name);
    const base = { name, weight: u.weight, italic: u.italic };
    if (!good.length) {
      const note = all.length
        ? all[0].reason ?? "la fuente incrustada no se pudo usar"
        : "el PDF no la trae como archivo TrueType (Type 3, CFF o no incrustada)";
      google.add(web.family);
      plan.stackOf.set(name, `'${web.family}',${generic}`);
      plan.substituted.push(`${name} → ${webLabel}: ${note}`);
      plan.fonts.push({ ...base, source: web.known ? "web" : "fallback", webFamily: web.family, note });
      continue;
    }
    // Varios subconjuntos con el mismo nombre: gana el primero que trae el carácter (= el orden del stack).
    plan.advOf.set(name, Object.assign({}, ...[...good].reverse().map((b) => b.adv)));
    const fams = good.map(({ buf }, i) => {
      const fam = `${cssName(name)}-${i}`;
      plan.faces.push(`@font-face{font-family:"${fam}";src:url(data:font/ttf;base64,${buf.toString("base64")}) format("truetype");}`);
      return `'${fam}'`;
    });
    const covered = new Set(good.flatMap((f) => f.cps));
    const missing = [...u.cps].filter((cp) => !covered.has(cp));
    if (missing.length) {
      const sample = missing.slice(0, 8).map((cp) => String.fromCodePoint(cp)).join(" ");
      const note = `la fuente incrustada no trae glifo para ${missing.length} carácter(es): ${sample}`;
      google.add(web.family);
      fams.push(`'${web.family}'`);
      plan.substituted.push(`${name}: ${note} → esos se pintan con ${webLabel}`);
      plan.fonts.push({ ...base, source: "embedded", webFamily: web.family, note });
    } else {
      plan.fonts.push({ ...base, source: "embedded" });
    }
    plan.stackOf.set(name, [...fams, generic].join(","));
  }
  plan.google = [...google];
  return plan;
}

export async function buildSkeleton(pdfPath: string, page: number): Promise<Skeleton> {
  const st = await readStext(pdfPath, page);
  const cssW = Math.round(st.width * PT_TO_CSS);
  const cssH = Math.round(st.height * PT_TO_CSS);

  // ── fuentes
  const files = await embeddedFonts(pdfPath, page).catch(() => new Map<string, EmbeddedFont[]>());
  const fixedOf = new Map<string, FixedFont[]>();
  const used = new Map<string, { weight: number; italic: boolean; cps: Set<number> }>();
  for (const c of st.chars) {
    if (!c.font) continue;
    const name = c.font.replace(/^[A-Z]{6}\+/, "");
    let u = used.get(name);
    if (!u) used.set(name, (u = { weight: c.weight ?? weightFromName(name), italic: c.italic ?? /italic|oblique/i.test(name), cps: new Set() }));
    if (!/^\s*$/.test(c.c)) u.cps.add(c.c.codePointAt(0)!);
  }
  for (const [name, u] of used) {
    const raw = files.get(name);
    if (raw?.length) fixedOf.set(name, await Promise.all(raw.map((r) => fixFont(r.buf, name, u.weight, u.italic, r.glyphMap))));
  }
  const plan = planFonts(used, fixedOf);
  const { stackOf, advOf, substituted, fonts } = plan;
  const imports = plan.google.length
    ? `@import url("https://fonts.googleapis.com/css2?${plan.google
        .map((g) => `family=${g.replace(/ /g, "+")}:ital,wght@0,400;0,700;1,400;1,700`)
        .join("&")}&display=block");`
    : "";
  const faces = plan.faces;

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
      const weight = c.weight ?? weightFromName(name);
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

  return { html, css, cssW, cssH, words, substituted, fonts };
}
