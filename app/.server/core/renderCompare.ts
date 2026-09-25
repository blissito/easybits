/**
 * compare_render — un veredicto determinista de si un clon HTML quedó igual a su PDF.
 *
 * Idea de Builder (agent-native): el agente itera contra un número fijo en vez de
 * esperar a que un humano diga "se ve bien". Como el agente OPTIMIZA ese número,
 * todo se mide sobre lo que el navegador PINTA, nunca sobre el código fuente —
 * si no, el atajo (pegar el PDF como imagen y esconder el texto) gana.
 *
 * Por página, el clon se renderiza al tamaño CSS de la página del PDF (pt × 4/3)
 * y se sacan cuatro cosas:
 *
 *   A, A′  captura completa dos veces → `trusted` (render determinista) y
 *          `overflow` (lo que se sale de la página ya no es invisible)
 *   T      captura con TODO el texto transparente → `liveText`: si aun así la zona
 *          de cada línea del original sigue viéndose como ese texto, el texto está
 *          horneado en una imagen (o escondido debajo). Un fondo legítimo (foto,
 *          membrete) no cuenta: sin su texto ya no se parece al original.
 *   P      el clon impreso a PDF → `pdftotext -bbox` → `text`: cada palabra del
 *          original emparejada con la del clon por contenido y posición (el
 *          criterio de Builder; los píxeles sólo inspeccionan).
 *
 * Más `layout` (diff difuminado para lo que no es texto: tablas, fondos, formas),
 * `regions`, `diffUrl` y `reasons` en lenguaje para el agente.
 *
 * El renderer es inyectable: en producción es la caja render-svc; la batería de
 * trampas (scripts/compare-battery.mts) usa Chrome local con el mismo contrato.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { lookup } from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { decodeHTML } from "entities";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { renderOnBox } from "./renderClient";
import { storeRender } from "./fleetRender";

const execFileAsync = promisify(execFile);

export const COMPARE_MAX_PAGES = 20;
/** Ancho del raster de referencia (pdftoppm) y de las capturas del clon. */
const RASTER_WIDTH = 1200;
const LAYOUT_WIDTH = 400;
const GRID = 4;
const TOP_REGIONS = 5;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Menos palabras que esto = PDF escaneado: no hay texto contra qué medir. */
const MIN_WORDS = 5;
const PT_TO_CSS = 4 / 3;

/**
 * Umbrales FIJOS: no los manda quien llama. El que llama suele ser el mismo agente
 * al que se califica, y con `{text: 0}` todo "pasaría". Calibrados con la batería
 * (scripts/compare-battery.mts): un clon fiel medido con MuPDF saca 1.0 en texto y
 * tipografía, y ~0.002 en layout.
 */
export const DEFAULT_THRESHOLDS = {
  /** Distancia máxima (pt) entre el origen de una palabra y el del original. */
  tolerancePt: 1.5,
  /** Fracción mínima de palabras del original en su lugar. Un clon fiel saca 1.0: no se
   * perdona ninguna (antes 0.98 dejaba correr 1 de cada 50 palabras). */
  text: 1,
  /** Fracción máxima del texto del clon que no existe en el original. */
  extra: 0.02,
  /** Fracción mínima de líneas cuyo texto es texto vivo, no imagen. */
  liveText: 0.95,
  /** Fracción mínima de palabras (en su lugar) con la misma fuente, tamaño, peso, color y ancho.
   * Un clon fiel saca 1.0; con 0.98 una palabra recoloreada pasaba. */
  typography: 1,
  /** Diferencia visual máxima (difuminada) — fondos, colores, tablas, formas. Original y
   * clon pasan por el mismo motor, así que un clon fiel da ~0; 0.003 atrapa un fondo
   * con otro tono o en grises (~0.009). */
  layout: 0.003,
  /** Diferencia máxima entre cómo se ve en pantalla y cómo se imprime (difuminada). */
  screen: 0.01,
  /** Peor celda de ≈ 5 % del ancho: un clon fiel ≤ 0.05; un logo borrado ≥ 0.3, una línea de
   * tabla de 1 px borrada ≈ 0.15. Aplica a original↔clon y a pantalla↔impresión. */
  cell: 0.1,
} as const;
export type Thresholds = { -readonly [K in keyof typeof DEFAULT_THRESHOLDS]: number };

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface ComparePageInput {
  /** Página del PDF, 1-based. */
  page: number;
  /** HTML completo del clon de esa página, diseñado a `pageCss`. */
  html: string;
}

export interface CompareInput {
  /** PDF original en la librería del owner. Gana sobre pdfUrl. */
  fileId?: string;
  /** PDF original por URL pública https (así llegan los adjuntos del chat). */
  pdfUrl?: string;
  pages: ComparePageInput[];
  /** Espera extra antes de capturar el clon (fuentes web lentas). */
  waitMs?: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  ratio: number;
}

export interface MisplacedWord {
  word: string;
  /** Posición en el original, px CSS de la página. */
  x: number;
  y: number;
  /** Desplazamiento del clon respecto al original, pt. null = no aparece. */
  dx: number | null;
  dy: number | null;
}

export interface FontInfo {
  family: string;
  size: number;
  /** 100–900. Del descriptor del PDF (/FontWeight) o, si falta, del nombre. */
  weight: number;
  italic: boolean;
  color: string;
}

export interface FontMismatch {
  word: string;
  x: number;
  y: number;
  original: FontInfo;
  clone: FontInfo;
  /** Qué difiere: family | size | weight | style | color | width. */
  differs: string[];
  /** Ancho de la palabra en pt, original vs clon. */
  widthPt: { original: number; clone: number };
}

export interface TextReport {
  /** Palabras del original. */
  words: number;
  /** Fracción del original que está en el clon, en su lugar. */
  matched: number;
  /** Fracción del original que no aparece en el clon. */
  missing: number;
  /** Fracción de los caracteres del clon que no existen en el original. */
  extra: number;
  /** Letras y números del clon que no están en el original (debe quedar vacío). */
  invented: string;
  /** Peores palabras: primero las fuera de lugar, luego las que faltan. */
  misplaced: MisplacedWord[];
  /** De las palabras en su lugar, fracción con la misma tipografía. null = sin datos de fuente. */
  typography: number | null;
  /** Ejemplos de palabras con otra tipografía (hasta 5). */
  fontMismatches: FontMismatch[];
  /** Familias usadas en el original (para que el clon use las mismas). */
  originalFonts: string[];
  /** Fracción de palabras en su lugar que no se ven (tapadas o invisibles). Debe ser 0. */
  hidden?: number;
  /** Fracción de palabras en su lugar que se dibujan con la forma del original. */
  glyphs?: number | null;
  hiddenWords?: MisplacedWord[];
  glyphMismatches?: (MisplacedWord & { ratio: number })[];
  /** Diferencia de forma por palabra revisada (diagnóstico/calibración). */
  glyphRatios?: number[];
  /** Palabras del original que no están en el texto del HTML. Debe quedar vacío. */
  notInSource?: string[];
}

export interface ComparePageResult {
  page: number;
  pass: boolean;
  /** Tamaño CSS al que se renderiza el clon (= la página del PDF). */
  pageCss: { width: number; height: number };
  trusted: boolean;
  /** Cuánto se sale el contenido de la página, px CSS. */
  overflow: { x: number; y: number };
  /** PDF sin capa de texto: sólo aplica `layout`. */
  scanned: boolean;
  /** Lo que el HTML usa y no se permite (scripts, @media, hojas externas…). */
  violations: string[];
  text: TextReport | null;
  liveText: number | null;
  layout: number | null;
  /** Diferencia entre pantalla e impresión (0 = se ven igual). */
  screen?: number | null;
  /** Diferencia de la celda más distinta (≈ 5 % del ancho): atrapa cambios pequeños y locales. */
  layoutWorstCell?: number | null;
  pixel: number | null;
  regions: Region[];
  diffUrl: string | null;
  /** Por qué no pasó, para que el agente sepa qué arreglar. */
  reasons: string[];
  error?: string;
}

export interface CompareResult {
  pages: ComparePageResult[];
  passed: number;
  total: number;
  thresholds: Thresholds;
}

/** Quién pinta el HTML. La caja en producción; Chrome local en la batería. */
export interface Renderer {
  /** Captura de página completa (fullPage). */
  screenshot(html: string, o: { width: number; height: number; dsf: number; waitMs?: number }): Promise<Buffer>;
  /** El HTML impreso a PDF de exactamente widthIn × heightIn, sin márgenes. */
  pdf(
    html: string,
    o: { width: number; height: number; widthIn: number; heightIn: number; waitMs?: number }
  ): Promise<Buffer>;
}

export function boxRenderer(ctx: AuthContext): Renderer {
  return {
    async screenshot(html, o) {
      const out = await renderOnBox(ctx, "screenshot", {
        html,
        viewport: { width: o.width, height: o.height },
        // Sin JavaScript: un clon de una página de PDF no lo necesita, y con él
        // podría detectar al verificador y pintar otra cosa.
        emulate: { deviceScaleFactor: o.dsf, javaScriptEnabled: false },
        ...(o.waitMs ? { waitMs: Math.round(o.waitMs) } : {}),
        screenshot: { type: "png", fullPage: true },
      });
      return out.bytes;
    },
    async pdf(html, o) {
      const out = await renderOnBox(ctx, "pdf", {
        html,
        viewport: { width: o.width, height: o.height },
        emulate: { javaScriptEnabled: false },
        ...(o.waitMs ? { waitMs: Math.round(o.waitMs) } : {}),
        pdf: {
          width: `${o.widthIn}in`,
          height: `${o.heightIn}in`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        },
      });
      return out.bytes;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Texto: MuPDF (mutool stext) por carácter
// ─────────────────────────────────────────────────────────────────────────────
//
// Por qué MuPDF y no pdftotext: Chrome incrusta las web fonts como Type 3, y con
// ellas pdftotext no sabe dónde cortar palabras ("660EUR") y reporta cajas más
// altas que la fuente real. mutool da cada carácter con su ORIGEN (x, línea base),
// tamaño y color reales — independientes de cómo se agrupe o incruste el texto.

export interface Box {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface Char {
  c: string;
  /** Origen del glifo: x y línea base, en pt. */
  x: number;
  y: number;
  /** Borde derecho del glifo (para separar palabras por hueco). */
  x1: number;
  size: number;
  font: string;
  /** Peso y cursiva declarados por el PDF para esta fuente (null = no los declara). */
  weight: number | null;
  italic: boolean | null;
  color: string;
}

export interface StextPage {
  width: number;
  height: number;
  /** En orden de lectura, espacios incluidos. */
  chars: Char[];
  lines: Box[];
}

export interface Word {
  text: string;
  /** Origen del primer carácter (pt). */
  x: number;
  y: number;
  /** Del origen del primer carácter al borde derecho del último (pt). */
  width: number;
  font: FontInfo;
  /** Caracteres que la forman (para comparar glifo por glifo). */
  chars?: Char[];
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

const attr = (a: string, name: string) => a.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/**
 * Parsea `mutool draw -F stext`. `fontNames` traduce las fuentes Type 3 (que
 * mutool nombra por objeto: "Type3 (6 0 R)") a su nombre real, sacado de pdffonts.
 */
export interface FontMeta {
  name: string;
  weight: number | null;
  italic: boolean | null;
}

export function parseStext(
  xml: string,
  byObj: Map<string, FontMeta> = new Map(),
  byName: Map<string, FontMeta> = new Map()
): StextPage {
  const page = xml.match(/<page\b([^>]*)>/);
  const out: StextPage = {
    width: Number(attr(page?.[1] ?? "", "width") ?? 0),
    height: Number(attr(page?.[1] ?? "", "height") ?? 0),
    chars: [],
    lines: [],
  };
  let font = "";
  let size = 0;
  let meta: FontMeta | undefined;
  for (const m of xml.matchAll(/<(font|char|line)\b([^>]*)>/g)) {
    const a = m[2];
    if (m[1] === "line") {
      const b = (attr(a, "bbox") ?? "").split(/\s+/).map(Number);
      if (b.length === 4 && b.every(Number.isFinite)) out.lines.push({ xMin: b[0], yMin: b[1], xMax: b[2], yMax: b[3] });
      // separador de línea: las palabras no cruzan líneas
      out.chars.push({ c: "\n", x: 0, y: 0, x1: 0, size: 0, font: "", weight: null, italic: null, color: "" });
    } else if (m[1] === "font") {
      const raw = attr(a, "name") ?? "";
      // Las Type 3 (web fonts en PDFs de Chrome) vienen por objeto: "Type3 (8 0 R)".
      const ref = raw.match(/^Type3 \((\d+) 0 R\)$/)?.[1];
      meta = ref ? byObj.get(ref) : byName.get(raw.replace(/^[A-Z]{6}\+/, ""));
      font = meta?.name || raw;
      size = Number(attr(a, "size") ?? 0);
    } else {
      const q = (attr(a, "quad") ?? "").split(/\s+/).map(Number);
      out.chars.push({
        c: decodeXml(attr(a, "c") ?? ""),
        x: Number(attr(a, "x")),
        y: Number(attr(a, "y")),
        x1: Number.isFinite(q[2]) ? q[2] : Number(attr(a, "x")),
        size,
        font,
        weight: meta?.weight ?? null,
        italic: meta?.italic ?? null,
        color: (attr(a, "color") ?? "#000000").toLowerCase(),
      });
    }
  }
  return out;
}

/** Fuentes de una página según `pdffonts`: nombre (sin prefijo de subconjunto) y objeto. */
export function parsePdffonts(out: string): { name: string; obj: string }[] {
  const list: { name: string; obj: string }[] = [];
  for (const line of out.split("\n").slice(2)) {
    const m = line.match(/^(\S+)\s.*\s(\d+)\s+\d+\s*$/);
    if (m) list.push({ name: m[1].replace(/^[A-Z]{6}\+/, ""), obj: m[2] });
  }
  return list;
}

/** `mutool show` de varios objetos → cuerpo de cada uno por número. */
async function showObjects(pdfPath: string, objs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!objs.length) return out;
  const { stdout } = await execFileAsync("mutool", ["show", pdfPath, ...objs], { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  for (const m of stdout.matchAll(/(^|\n)(\d+) 0 obj\b([\s\S]*?)(?=\n\d+ 0 obj\b|$)/g)) out.set(m[2], m[3]);
  return out;
}

/**
 * Peso y cursiva de cada fuente, del DESCRIPTOR del PDF (/FontWeight, /ItalicAngle,
 * /Flags). Chrome nombra todos los pesos de una fuente variable "Inter-Regular",
 * pero sí escribe /FontWeight 400/700/900 en cada instancia: el nombre miente, el
 * descriptor no. Sin descriptor (o sin esos campos) queda null y se usa el nombre.
 */
export async function readFontMeta(
  pdfPath: string,
  page: number,
  type3Refs: string[] = []
): Promise<{ byObj: Map<string, FontMeta>; byName: Map<string, FontMeta> }> {
  const byObj = new Map<string, FontMeta>();
  const byName = new Map<string, FontMeta>();
  try {
    const { stdout } = await execFileAsync("pdffonts", ["-f", String(page), "-l", String(page), pdfPath], { timeout: 30_000 });
    const fonts = parsePdffonts(stdout);
    // Las Type 3 que usa el texto, aunque pdffonts no las liste o las llame "[none]".
    for (const ref of type3Refs) if (!fonts.some((f) => f.obj === ref)) fonts.push({ name: "", obj: ref });
    const dicts = await showObjects(pdfPath, fonts.map((f) => f.obj));
    // Type0 → la fuente descendiente trae el descriptor.
    const descOf = new Map<string, string>();
    const descendantOf = new Map<string, string>();
    for (const [obj, body] of dicts) {
      const d = body.match(/\/FontDescriptor (\d+) 0 R/)?.[1];
      if (d) descOf.set(obj, d);
      const k = body.match(/\/DescendantFonts\s*\[\s*(\d+) 0 R/)?.[1];
      if (k) descendantOf.set(obj, k);
    }
    const kids = await showObjects(pdfPath, [...new Set(descendantOf.values())]);
    for (const [obj, kid] of descendantOf) {
      const d = kids.get(kid)?.match(/\/FontDescriptor (\d+) 0 R/)?.[1];
      if (d) descOf.set(obj, d);
    }
    const descs = await showObjects(pdfPath, [...new Set(descOf.values())]);
    const names = new Map<string, FontMeta[]>();
    for (const f of fonts) {
      const body = descs.get(descOf.get(f.obj) ?? "") ?? "";
      const w = body.match(/\/FontWeight (\d+)/)?.[1];
      const angle = body.match(/\/ItalicAngle (-?[\d.]+)/)?.[1];
      const flags = Number(body.match(/\/Flags (\d+)/)?.[1] ?? 0);
      // El nombre real vive en el descriptor (/FontName); pdffonts viejo dice "[none]".
      const descName = body.match(/\/FontName \/([^\s/<>\[\]]+)/)?.[1]?.replace(/^[A-Z]{6}\+/, "");
      const meta: FontMeta = {
        name: descName || (f.name && f.name !== "[none]" ? f.name : "Type3"),
        weight: w ? Number(w) : null,
        italic: angle != null ? Number(angle) !== 0 || (flags & 64) !== 0 : null,
      };
      byObj.set(f.obj, meta);
      const key = f.name && f.name !== "[none]" ? f.name : meta.name;
      if (!names.has(key)) names.set(key, []);
      names.get(key)!.push(meta);
    }
    // Por nombre sólo si no es ambiguo (varios objetos con el mismo nombre y otro peso).
    for (const [name, list] of names) {
      if (list.every((m) => m.weight === list[0].weight && m.italic === list[0].italic)) byName.set(name, list[0]);
      else byName.set(name, { name, weight: null, italic: null });
    }
  } catch {
    // sin metadatos: el peso sale del nombre
  }
  return { byObj, byName };
}

export async function readStext(pdfPath: string, page: number): Promise<StextPage> {
  const { stdout: xml } = await execFileAsync("mutool", ["draw", "-q", "-F", "stext", "-o", "-", pdfPath, String(page)], {
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const refs = [...new Set([...xml.matchAll(/name="Type3 \((\d+) 0 R\)"/g)].map((m) => m[1]))];
  const meta = await readFontMeta(pdfPath, page, refs);
  return parseStext(xml, meta.byObj, meta.byName);
}

/**
 * Igualdad de carácter tolerante SÓLO a lo que es el mismo texto: ligaduras
 * tipográficas (un PDF guarda "ﬁ" como un glifo), guion suave, comillas y guiones
 * tipográficos. No NFKC: esa convierte "m²" en "m2" y "½" en "1⁄2", y un clon que
 * cambia el superíndice por un 2 normal pasaría.
 */
const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
function norm(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/\u00ad/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-");
}

const isSpace = (c: string) => /^\s*$/.test(c);
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round1 = (n: number) => Math.round(n * 10) / 10;

function weightFromName(name: string): number {
  if (/black|heavy/i.test(name)) return 900;
  if (/extrabold|ultrabold/i.test(name)) return 800;
  if (/semibold|demibold/i.test(name)) return 600;
  if (/bold/i.test(name)) return 700;
  if (/medium/i.test(name)) return 500;
  if (/extralight|ultralight/i.test(name)) return 200;
  if (/light/i.test(name)) return 300;
  if (/thin|hairline/i.test(name)) return 100;
  return 400;
}

function fontOf(ch: Char): FontInfo {
  const name = ch.font.replace(/^[A-Z]{6}\+/, "");
  return {
    family: name,
    size: Math.round(ch.size * 10) / 10,
    weight: ch.weight ?? weightFromName(name),
    italic: ch.italic ?? /italic|oblique/i.test(name),
    color: ch.color,
  };
}

/**
 * Palabras del original: se cortan en espacios, cambios de línea y huecos
 * mayores a un cuarto del tamaño de letra (PDFs que no dibujan el espacio).
 */
export function toWords(chars: Char[]): Word[] {
  const words: Word[] = [];
  let cur: Char[] = [];
  const flush = () => {
    const text = norm(cur.map((c) => c.c).join(""));
    // Iconos de fuente (uso privado de Unicode) o glifos sin texto: un clon legítimo
    // los reemplaza por SVG, no hay texto que exigir.
    if (text && !/^[\uE000-\uF8FF\uFFFD\p{Cc}]+$/u.test(text))
      words.push({ text, x: cur[0].x, y: cur[0].y, width: cur[cur.length - 1].x1 - cur[0].x, font: fontOf(cur[0]), chars: cur });
    cur = [];
  };
  for (const ch of chars) {
    if (ch.c === "\n" || isSpace(ch.c)) {
      flush();
      continue;
    }
    const prev = cur[cur.length - 1];
    if (prev && (Math.abs(ch.y - prev.y) > prev.size * 0.5 || ch.x - prev.x1 > Math.max(prev.size, ch.size) * 0.25)) flush();
    cur.push(ch);
  }
  flush();
  return words;
}

/**
 * Llave de familia: sin prefijo de subconjunto ni sufijos de estilo, y las fuentes
 * con métricas idénticas unificadas — la caja Linux no trae Arial pero sí Liberation
 * Sans, que mide igual; reprobar por eso sería castigar al clon por el servidor.
 */
const FAMILY_ALIASES: Record<string, string> = {
  liberationsans: "arial", arimo: "arial", arial: "arial",
  helvetica: "arial", nimbussans: "arial", nimbussanl: "arial", texgyreheros: "arial",
  liberationserif: "times", tinos: "times", timesnewroman: "times", times: "times",
  nimbusroman: "times", nimbusromno9l: "times", texgyretermes: "times",
  liberationmono: "courier", cousine: "courier", couriernew: "courier", courier: "courier",
  carlito: "calibri", calibri: "calibri",
  caladea: "cambria", cambria: "cambria",
};
export function familyKey(name: string): string {
  let k = name.replace(/^[A-Z]{6}\+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = /(regular|bold|italic|oblique|medium|semibold|demibold|light|extralight|thin|black|heavy|extrabold|condensed|narrow|book|roman|psmt|mt|ps)$/;
  for (let i = 0; i < 6 && suffix.test(k); i++) k = k.replace(suffix, "");
  return FAMILY_ALIASES[k] ?? k;
}

function colorDistance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const [x, y] = [p(a), p(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}

/**
 * Qué difiere entre la tipografía del original y la del clon. Peso y cursiva salen
 * del descriptor del PDF (ver `readFontMeta`), no del nombre.
 */
export function fontDiff(o: FontInfo, c: FontInfo): string[] {
  const d: string[] = [];
  if (familyKey(o.family) !== familyKey(c.family)) d.push("family");
  if (Math.abs(o.size - c.size) > Math.max(0.5, o.size * 0.08)) d.push("size");
  if (Math.abs(o.weight - c.weight) >= 200) d.push("weight");
  if (o.italic !== c.italic) d.push("style");
  if (colorDistance(o.color, c.color) > 90) d.push("color");
  return d;
}

/**
 * Busca cada palabra del original en la SECUENCIA de caracteres del clon (sin
 * espacios), no en sus palabras: así da igual cómo agrupe el clon el texto.
 * De las apariciones no usadas se toma la más cercana; sus caracteres quedan
 * reclamados (un solo "EUR" no alcanza para toda la tabla). Posición = origen del
 * primer carácter, tipografía = la de ese carácter.
 */
export function matchText(
  orig: Word[],
  cloneChars: Char[],
  tolerancePt: number
): TextReport & { placed: PlacedWord[] } {
  const seq: Char[] = [];
  let str = "";
  for (const ch of cloneChars) {
    if (ch.c === "\n" || isSpace(ch.c)) continue;
    for (const piece of norm(ch.c)) {
      seq.push(ch);
      str += piece;
    }
  }
  const used = new Uint8Array(seq.length);
  let ok = 0;
  let typed = 0;
  let missing = 0;
  const off: (MisplacedWord & { d: number })[] = [];
  const absent: MisplacedWord[] = [];
  const fontBad: FontMismatch[] = [];
  const placed: PlacedWord[] = [];
  const at = (w: Word) => ({ word: w.text, x: Math.round(w.x * PT_TO_CSS), y: Math.round(w.y * PT_TO_CSS) });

  for (const o0 of orig) {
    const o = { ...o0, text: norm(o0.text) };
    let best = -1;
    let bestD = Infinity;
    for (let i = str.indexOf(o.text); i !== -1; i = str.indexOf(o.text, i + 1)) {
      let free = true;
      for (let j = i; j < i + o.text.length; j++) if (used[j]) free = false;
      if (!free) continue;
      // la palabra no puede cruzar de una línea a otra en el clon
      const first = seq[i];
      const last = seq[i + o.text.length - 1];
      if (Math.abs(last.y - first.y) > Math.max(first.size, 1) * 0.5) continue;
      const d = Math.hypot(first.x - o.x, first.y - o.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) {
      missing++;
      absent.push({ ...at(o), dx: null, dy: null });
      continue;
    }
    for (let j = best; j < best + o.text.length; j++) used[j] = 1;
    const c = seq[best];
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    if (Math.abs(dx) <= tolerancePt && Math.abs(dy) <= tolerancePt) {
      ok++;
      typed++;
      placed.push({ ...o0, dx, dy, cloneChars: seq.slice(best, best + o.text.length) });
      const cf = fontOf(c);
      const differs = fontDiff(o.font, cf);
      // Mismo nombre y tamaño no bastan: el espaciado de caracteres del PDF (Tc) o
      // una fuente con otras métricas hacen que la palabra choque con la siguiente.
      const cw = seq[best + o.text.length - 1].x1 - c.x;
      if (Math.abs(cw - o.width) > Math.max(1.5, o.width * 0.08)) differs.push("width");
      if (differs.length) fontBad.push({ ...at(o), original: o.font, clone: cf, differs, widthPt: { original: round1(o.width), clone: round1(cw) } });
    } else {
      off.push({ ...at(o), dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, d: bestD });
    }
  }
  off.sort((a, b) => b.d - a.d);
  const total = orig.length || 1;
  let unused = 0;
  let invented = "";
  for (let j = 0; j < used.length; j++) {
    if (used[j]) continue;
    unused++;
    // Letras o números de más = contenido que el original no tiene.
    if (/[\p{L}\p{N}]/u.test(str[j])) invented += str[j];
  }
  return {
    words: orig.length,
    matched: round4(ok / total),
    missing: round4(missing / total),
    extra: round4(seq.length ? unused / seq.length : 0),
    misplaced: [...off.map(({ d: _d, ...m }) => m), ...absent].slice(0, 5),
    invented: invented.slice(0, 60),
    typography: typed ? round4((typed - fontBad.length) / typed) : null,
    fontMismatches: fontBad.slice(0, 5),
    originalFonts: [...new Set(orig.map((w) => w.font.family))],
    placed,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Imagen: diff, regiones, texto vivo, desborde
// ─────────────────────────────────────────────────────────────────────────────

function decode(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

/** Recorta (o rellena de blanco) un PNG a width×height exactos, desde arriba a la izquierda. */
export async function cropTo(buf: Buffer, width: number, height: number): Promise<Buffer> {
  const img = decode(buf);
  if (img.width === width && img.height === height) return buf;
  const sharp = (await import("sharp")).default;
  const w = Math.min(width, img.width);
  const h = Math.min(height, img.height);
  const part = await sharp(buf).extract({ left: 0, top: 0, width: w, height: h }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: part, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/** Mismo PNG, píxel a píxel (determinismo del render). */
export function sameImage(a: Buffer, b: Buffer): boolean {
  const x = decode(a);
  const y = decode(b);
  if (x.width !== y.width || x.height !== y.height) return false;
  return pixelmatch(x.data, y.data, undefined, x.width, x.height, { threshold: 0 }) === 0;
}

/** Cuánto se sale una captura de página completa del tamaño esperado, en px CSS. */
export function overflowOf(shot: Buffer, width: number, height: number, dsf: number): { x: number; y: number } {
  const img = decode(shot);
  // 2 px de gracia: redondeos de la densidad de pantalla.
  const over = (got: number, want: number) => (got - want > 2 ? Math.round((got - want) / dsf) : 0);
  return { x: over(img.width, width), y: over(img.height, height) };
}

/** Celdas de la rejilla con más píxeles rojos; `scale` lleva a px del raster. */
export function topRegions(diff: PNG, scale = 1): Region[] {
  const cw = Math.ceil(diff.width / GRID);
  const ch = Math.ceil(diff.height / GRID);
  const cells: Region[] = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = gx * cw;
      const y0 = gy * ch;
      const x1 = Math.min(x0 + cw, diff.width);
      const y1 = Math.min(y0 + ch, diff.height);
      if (x1 <= x0 || y1 <= y0) continue;
      let red = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * diff.width + x) * 4;
          if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) red++;
        }
      }
      const ratio = red / ((x1 - x0) * (y1 - y0));
      if (ratio > 0) {
        cells.push({
          x: Math.round(x0 * scale),
          y: Math.round(y0 * scale),
          w: Math.round((x1 - x0) * scale),
          h: Math.round((y1 - y0) * scale),
          ratio: round4(ratio),
        });
      }
    }
  }
  cells.sort((a, b) => b.ratio - a.ratio || a.y - b.y || a.x - b.x);
  return cells.slice(0, TOP_REGIONS);
}

async function layoutView(buf: Buffer, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buf).resize(LAYOUT_WIDTH, height, { fit: "fill" }).blur(1).ensureAlpha().raw().toBuffer();
}

export interface ImageMetrics {
  pixel: number;
  layout: number;
  /** Peor celda (≈ 20×20 px a 400 de ancho). */
  worstCell: number;
  /** Regiones en px del raster. */
  regions: Region[];
  montage: Buffer;
}

/** Referencia contra el clon (el clon se recorta al tamaño de la referencia). */
export async function compareImages(ref: Buffer, cand: Buffer): Promise<ImageMetrics> {
  const r = decode(ref);
  const { width, height } = r;
  const c = decode(await cropTo(cand, width, height));

  // El número excluye antialias, pero la imagen pinta TODA diferencia en rojo:
  // un texto corrido pixelmatch a veces lo clasifica como antialias.
  const diff = new PNG({ width, height });
  const px = pixelmatch(r.data, c.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
    diffColor: [255, 0, 0],
    aaColor: [255, 0, 0],
  });

  const lh = Math.max(1, Math.round((height * LAYOUT_WIDTH) / width));
  const [lr, lc] = await Promise.all([layoutView(ref, lh), layoutView(PNG.sync.write(c), lh)]);
  const ldiff = new PNG({ width: LAYOUT_WIDTH, height: lh });
  const lpx = pixelmatch(lr, lc, ldiff.data, LAYOUT_WIDTH, lh, {
    threshold: 0.15,
    includeAA: false,
    diffColor: [255, 0, 0],
    aaColor: [255, 255, 0],
  });

  const sharp = (await import("sharp")).default;
  const gap = 12;
  const montage = await sharp({
    create: { width: width * 3 + gap * 2, height, channels: 4, background: { r: 17, g: 17, b: 17, alpha: 1 } },
  })
    .composite([
      { input: ref, left: 0, top: 0 },
      { input: PNG.sync.write(c), left: width + gap, top: 0 },
      { input: PNG.sync.write(diff), left: (width + gap) * 2, top: 0 },
    ])
    .png()
    .toBuffer();

  return {
    pixel: round4(px / (width * height)),
    layout: round4(lpx / (LAYOUT_WIDTH * lh)),
    worstCell: worstCell(ldiff),
    regions: topRegions(ldiff, width / LAYOUT_WIDTH),
    montage,
  };
}

/**
 * La celda más distinta de una rejilla fina (≈ 20×20 px a 400 de ancho). El
 * promedio de la página no ve un logo borrado o una foto cambiada: en una página
 * casi blanca, quitar un recuadro de 50 px mueve el promedio 0.1 %.
 */
export function worstCell(diff: PNG, cell = 20): number {
  let worst = 0;
  for (let y0 = 0; y0 < diff.height; y0 += cell / 2) {
    for (let x0 = 0; x0 < diff.width; x0 += cell / 2) {
      const x1 = Math.min(diff.width, x0 + cell);
      const y1 = Math.min(diff.height, y0 + cell);
      let red = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * diff.width + x) * 4;
          if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) red++;
        }
      worst = Math.max(worst, red / ((x1 - x0) * (y1 - y0)));
    }
  }
  return round4(worst);
}

/** Luminancia por píxel de un PNG, opcionalmente difuminada (sigma en px). */
async function luminance(png: Buffer, sigma = 0): Promise<{ lum: Uint8Array; w: number; h: number }> {
  const sharp = (await import("sharp")).default;
  let img = sharp(png).removeAlpha().greyscale();
  if (sigma > 0) img = img.blur(sigma);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { lum: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

/** Sigma del difuminado de `liveTextShare`: tapa desplazamientos de unos px. */
const LIVE_SIGMA = 2.5;

/**
 * Fracción de líneas del original cuyo texto, en el clon, es texto VIVO.
 *
 * Pregunta: con TODO el texto del DOM oculto (`hiddenPng`), ¿se sigue viendo el
 * texto del original en su lugar? Si sí, lo que se ve es una imagen (o texto
 * escondido encima de una imagen): está horneado.
 *
 * Por línea: los píxeles de tinta del original (lejos del fondo de la línea)
 * forman una máscara. En versiones difuminadas —para que mover o difuminar la
 * imagen unos px no lo esquive— se mide cuánto del contraste de esa tinta
 * sobrevive en el clon-sin-texto. Sobrevive ≥ 50 % → horneada. Un fondo
 * legítimo (foto, membrete) no cae aquí: sin su texto no reproduce la tinta.
 */
export async function liveTextShare(
  refPng: Buffer,
  hiddenPng: Buffer,
  lines: Box[],
  ptToPx: number
): Promise<{ share: number | null; baked: number[] }> {
  const [ref, refB, hidB] = await Promise.all([
    luminance(refPng),
    luminance(refPng, LIVE_SIGMA),
    luminance(hiddenPng, LIVE_SIGMA),
  ]);
  const { w, h } = ref;
  const at = (img: Uint8Array, x: number, y: number) => img[y * w + x];
  const baked: number[] = [];
  let counted = 0;
  lines.forEach((l, i) => {
    const x0 = Math.max(0, Math.floor(l.xMin * ptToPx));
    const y0 = Math.max(0, Math.floor(l.yMin * ptToPx));
    const x1 = Math.min(w - 1, Math.ceil(l.xMax * ptToPx));
    const y1 = Math.min(h - 1, Math.ceil(l.yMax * ptToPx));
    if (x1 - x0 < 3 || y1 - y0 < 3) return;
    // Fondo de la línea: mediana del anillo de 2 px alrededor, en el original.
    const ring: number[] = [];
    for (let x = x0; x <= x1; x++) {
      if (y0 >= 2) ring.push(at(ref.lum, x, y0 - 2));
      if (y1 + 2 < h) ring.push(at(ref.lum, x, y1 + 2));
    }
    for (let y = y0; y <= y1; y++) {
      if (x0 >= 2) ring.push(at(ref.lum, x0 - 2, y));
      if (x1 + 2 < w) ring.push(at(ref.lum, x1 + 2, y));
    }
    if (!ring.length) return;
    ring.sort((a, b) => a - b);
    const bg = ring[ring.length >> 1];
    let mask = 0;
    let survived = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.abs(at(ref.lum, x, y) - bg) < 60) continue; // no es tinta
        const contrast = Math.abs(at(refB.lum, x, y) - bg);
        if (contrast < 12) continue; // tinta tan fina que el difuminado la borra: no informa
        mask++;
        // 1 = el clon sin texto se ve igual que el original aquí; 0 = se ve como fondo.
        const keep = 1 - Math.min(1, Math.abs(at(hidB.lum, x, y) - at(refB.lum, x, y)) / contrast);
        survived += keep;
      }
    }
    if (mask < 8) return;
    counted++;
    if (survived / mask >= 0.5) baked.push(i);
  });
  if (!counted) return { share: null, baked };
  return { share: round4((counted - baked.length) / counted), baked };
}


// ─────────────────────────────────────────────────────────────────────────────
// Evaluación de una página
// ─────────────────────────────────────────────────────────────────────────────

export interface PageGeometry {
  /** Página del PDF en pt. */
  widthPt: number;
  heightPt: number;
  /** Tamaño CSS del clon (px). */
  cssW: number;
  cssH: number;
  /** Densidad para que la captura mida RASTER_WIDTH de ancho. */
  dsf: number;
  rasterW: number;
  rasterH: number;
}

export function geometry(widthPt: number, heightPt: number): PageGeometry {
  const cssW = Math.round(widthPt * PT_TO_CSS);
  const cssH = Math.round(heightPt * PT_TO_CSS);
  const dsf = RASTER_WIDTH / cssW;
  return { widthPt, heightPt, cssW, cssH, dsf, rasterW: RASTER_WIDTH, rasterH: Math.round(cssH * dsf) };
}

export interface EvaluatedPage extends Omit<ComparePageResult, "diffUrl"> {
  montage: Buffer | null;
}

function pct(n: number) {
  return `${Math.round(n * 1000) / 10} %`;
}

// ─── Política del HTML ──────────────────────────────────────────────────────

/**
 * Lo que un clon de una página de PDF no necesita y sí sirve para engañar:
 * scripts (detectan al verificador), @media / media= (pantalla distinta a la
 * impresión, de donde sale el texto), hojas externas (esconden lo anterior),
 * frames y texto generado con CSS `content:`. Se revisa sólo el CSS y el
 * marcado, no el texto: un documento que HABLA de "@media" no cuenta.
 */
export function htmlViolations(html: string): string[] {
  const v: string[] = [];
  const css = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => m[2] ?? m[3] ?? ""),
  ].join("\n");
  const markup = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/<script\b/i.test(markup)) v.push("usa <script> (el clon se evalúa sin JavaScript)");
  if (/<[^>]+\son[a-z]+\s*=/i.test(markup)) v.push("usa manejadores de eventos (on…=)");
  if (/javascript:/i.test(markup)) v.push("usa enlaces javascript:");
  if (/<(iframe|frame|object|embed|portal)\b/i.test(markup)) v.push("usa iframe/object/embed");
  if (/<(link|style|source)\b[^>]*\smedia\s*=/i.test(markup)) v.push("usa el atributo media=");
  if (/@media\b/i.test(css)) v.push("usa @media (la página tiene un solo tamaño y se imprime igual que se ve)");
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) {
    if (!/^https:\/\/fonts\.(googleapis|bunny)\./i.test(m[1])) v.push(`usa @import de ${m[1]} (sólo se permiten Google Fonts / Bunny Fonts)`);
  }
  for (const m of markup.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(m[0])) continue;
    const href = m[0].match(/href\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
    if (!/^https:\/\/fonts\.(googleapis|bunny)\./i.test(href)) v.push(`carga la hoja externa ${href || "(sin href)"} (inclúyela en el HTML)`);
  }
  // Efectos que Chrome pinta en pantalla pero NO imprime: el texto (que sale de la
  // impresión) diría una cosa y la pantalla mostraría otra.
  if (/(^|[;{\s])(-webkit-)?backdrop-filter\s*:/i.test(css)) v.push("usa backdrop-filter (no se imprime igual que se ve)");
  if (/(^|[;{\s])mix-blend-mode\s*:\s*(?!normal)/i.test(css)) v.push("usa mix-blend-mode (no se imprime igual que se ve)");
  if (/content\s*:\s*[^;}]*(attr\s*\(|["'][^"']*[\p{L}\p{N}])/iu.test(css)) {
    v.push("genera texto con CSS content: (el texto debe estar en el HTML)");
  }
  return [...new Set(v)];
}

/** Texto del HTML sin marcado, espacios ni entidades: contra esto se busca cada palabra. */
export function sourceText(html: string): string {
  return norm(
    html
      .replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, "")
  )
    // Todas las entidades de HTML5 (&eacute;, &sup2;, &euro;…): un clon escrito a
    // mano las usa y no puede salir "sin texto en el HTML" por eso.
    .replace(/&[#a-z0-9]+;/gi, (e) => norm(decodeHTML(e)))
    .replace(/\s+/g, "");
}

// ─── Rasterizado: un solo motor para original y clon ────────────────────────

/**
 * Página de un PDF a PNG de `width` px con MuPDF. `noText` = sin texto (-K):
 * es "el clon sin su texto", sacado del PDF impreso y no de CSS, así que el clon
 * no tiene cómo reaccionar. Original y clon pasan por el MISMO motor: sin eso,
 * el suavizado de Chrome contra el de poppler metía ~10 % de diferencia falsa.
 */
async function rasterize(pdfPath: string, page: number, width: number, noText = false): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "mutool",
    ["draw", "-q", ...(noText ? ["-K"] : []), "-F", "png", "-w", String(width), "-o", "-", pdfPath, String(page)],
    { timeout: 60_000, maxBuffer: 128 * 1024 * 1024, encoding: "buffer" }
  );
  return stdout as unknown as Buffer;
}

async function pageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 30_000 });
    return Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 1);
  } catch {
    return 1;
  }
}

/** Caja de una palabra en px del raster (origen + ancho; alto por el tamaño de letra). */
function wordBox(w: Word, ptToPx: number) {
  return {
    x: w.x * ptToPx - 2,
    y: (w.y - w.font.size * 0.9) * ptToPx - 2,
    w: w.width * ptToPx + 4,
    h: w.font.size * 1.2 * ptToPx + 4,
  };
}

/** Fracción de píxeles distintos entre dos PNG dentro de una caja. */
/**
 * Fracción de píxeles distintos entre la caja de `a` y la de `b` corrida (ox, oy)
 * px: así se compara la palabra del clon donde el clon la dibujó, no donde la
 * tenía el original (la tolerancia de posición deja hasta ~3 px de diferencia).
 */
function boxDiff(
  a: PNG,
  b: PNG,
  box: { x: number; y: number; w: number; h: number },
  threshold: number,
  includeAA = true,
  ox = 0,
  oy = 0
): number {
  const x0 = Math.max(0, Math.floor(box.x), -ox);
  const y0 = Math.max(0, Math.floor(box.y), -oy);
  const x1 = Math.min(a.width, b.width - ox, Math.ceil(box.x + box.w));
  const y1 = Math.min(a.height, b.height - oy, Math.ceil(box.y + box.h));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return 0;
  const crop = (img: PNG, dx: number, dy: number) => {
    const out = Buffer.alloc(cw * ch * 4);
    for (let row = 0; row < ch; row++) {
      const src = ((y0 + dy + row) * img.width + x0 + dx) * 4;
      img.data.copy(out, row * cw * 4, src, src + cw * 4);
    }
    return out;
  };
  return pixelmatch(crop(a, 0, 0), crop(b, ox, oy), undefined, cw, ch, { threshold, includeAA }) / (cw * ch);
}

/**
 * Qué tanto NO coincide la tinta de dos glifos: de los píxeles que son tinta en
 * cualquiera de los dos (lejos del fondo de su caja), la fracción donde difieren.
 * Normalizar por tinta —no por el área de la caja, que es casi todo fondo— es lo
 * que separa "otro glifo" (un 7 dibujado como 9) de "el mismo glifo medio píxel
 * corrido". Sobre luminancia difuminada (sigma 1) para no castigar el subpíxel.
 */
function inkMismatch(
  a: { lum: Uint8Array; w: number; h: number },
  b: { lum: Uint8Array; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
  ox: number,
  oy: number
): number | null {
  const x0 = Math.max(2, Math.floor(box.x), 2 - ox);
  const y0 = Math.max(2, Math.floor(box.y), 2 - oy);
  const x1 = Math.min(a.w - 3, b.w - 3 - ox, Math.ceil(box.x + box.w));
  const y1 = Math.min(a.h - 3, b.h - 3 - oy, Math.ceil(box.y + box.h));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const bgOf = (img: typeof a, dx: number, dy: number) => {
    const ring: number[] = [];
    for (let x = x0; x <= x1; x++) ring.push(img.lum[(y0 - 2 + dy) * img.w + x + dx], img.lum[(y1 + 2 + dy) * img.w + x + dx]);
    ring.sort((p, q) => p - q);
    return ring[ring.length >> 1];
  };
  const bgA = bgOf(a, 0, 0);
  const bgB = bgOf(b, ox, oy);
  let union = 0;
  let miss = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const va = a.lum[y * a.w + x];
      const vb = b.lum[(y + oy) * b.w + x + ox];
      const inkA = Math.abs(va - bgA) > 40;
      const inkB = Math.abs(vb - bgB) > 40;
      if (!inkA && !inkB) continue;
      union++;
      if (Math.abs(Math.abs(va - bgA) - Math.abs(vb - bgB)) > 60) miss++;
    }
  }
  return union < 6 ? null : miss / union;
}

/** Color mediano de la tinta (lo que se aleja del fondo) dentro de una caja; null si casi no hay. */
function inkColor(img: PNG, box: { x: number; y: number; w: number; h: number }): [number, number, number] | null {
  const x0 = Math.max(2, Math.floor(box.x));
  const y0 = Math.max(2, Math.floor(box.y));
  const x1 = Math.min(img.width - 3, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.height - 3, Math.ceil(box.y + box.h));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  const px = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]] as [number, number, number];
  };
  const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const ring: number[] = [];
  for (let x = x0; x <= x1; x++) ring.push(lum(px(x, y0 - 2)), lum(px(x, y1 + 2)));
  ring.sort((a, b) => a - b);
  const bg = ring[ring.length >> 1];
  const ink: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = px(x, y);
    // Sólo el núcleo del glifo: el borde suavizado difiere entre motores (Skia vs MuPDF).
    if (Math.abs(lum(c) - bg) > 110) ink.push(c);
  }
  if (ink.length < 15) return null;
  const med = (k: number) => ink.map((c) => c[k]).sort((a, b) => a - b)[ink.length >> 1];
  return [med(0), med(1), med(2)];
}

/** Una palabra "se ve" si quitar el texto cambia su caja: si no cambia, está tapada o es invisible. */
const VISIBLE_MIN = 0.02;
/** Forma de los glifos: diferencia máxima entre original y clon en la caja de la palabra. */
export const GLYPH_MAX = 0.35;

/** Palabra del original ya emparejada, con lo que se corrió en el clon (pt). */
export type PlacedWord = Word & { dx: number; dy: number; cloneChars: Char[] };

export interface WordChecks {
  hidden: MisplacedWord[];
  glyph: (MisplacedWord & { ratio: number })[];
  checked: number;
  /** Diferencia de forma de cada palabra revisada (para calibrar). */
  ratios: number[];
  /** Palabras cuyo color en pantalla no es el impreso. */
  screenColor: MisplacedWord[];
}

/**
 * Por cada palabra en su lugar: ¿se ve? (clon vs clon-sin-texto) y ¿tiene la
 * forma del original? (clon vs original). Lo segundo atrapa una fuente con el
 * nombre correcto pero glifos cambiados (un "7" que se dibuja como "9").
 */
export async function checkWords(
  refPng: Buffer,
  clonePng: Buffer,
  noTextPng: Buffer,
  words: PlacedWord[],
  ptToPx: number,
  screenPng?: Buffer
): Promise<WordChecks> {
  const ref = PNG.sync.read(refPng);
  const cl = PNG.sync.read(clonePng);
  const nt = PNG.sync.read(noTextPng);
  const scr = screenPng ? PNG.sync.read(screenPng) : null;
  const screenColor: MisplacedWord[] = [];
  const [refL, clL] = await Promise.all([luminance(refPng, 1), luminance(clonePng, 1)]);
  const hidden: MisplacedWord[] = [];
  const glyph: (MisplacedWord & { ratio: number })[] = [];
  const ratios: number[] = [];
  const at = (w: Word) => ({ word: w.text, x: Math.round(w.x * PT_TO_CSS), y: Math.round(w.y * PT_TO_CSS), dx: 0, dy: 0 });
  let checked = 0;
  for (const w of words) {
    const box = wordBox(w, ptToPx);
    if (box.w < 4 || box.h < 4) continue;
    checked++;
    const shifted = { ...box, x: box.x + w.dx * ptToPx, y: box.y + w.dy * ptToPx };
    if (boxDiff(cl, nt, shifted, 0.05) < VISIBLE_MIN) {
      hidden.push(at(w));
      continue;
    }
    // La tinta de la palabra en PANTALLA debe tener el color que tiene impresa.
    if (scr) {
      const a = inkColor(cl, shifted);
      const b = inkColor(scr, shifted);
      if (a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 120) screenColor.push(at(w));
    }
    // Glifo por glifo: cada carácter del original contra el del clon, alineado con
    // SU origen (±1 px por el subpíxel). Por palabra, un solo dígito cambiado se
    // diluía en el resto; por carácter no.
    const oc = (w.chars ?? []).filter((c) => !/^\s$/.test(c.c));
    let worst = 0;
    if (oc.length === w.cloneChars.length) {
      for (let k = 0; k < oc.length; k++) {
        const o = oc[k];
        const c = w.cloneChars[k];
        const cb = {
          x: o.x * ptToPx - 1,
          y: (o.y - o.size * 0.9) * ptToPx - 1,
          w: Math.max(1, o.x1 - o.x) * ptToPx + 2,
          h: o.size * 1.2 * ptToPx + 2,
        };
        if (cb.w < 3 || cb.h < 3) continue;
        const bx = Math.round((c.x - o.x) * ptToPx);
        const by = Math.round((c.y - o.y) * ptToPx);
        let r = Infinity;
        for (let oy = by - 1; oy <= by + 1; oy++)
          for (let ox = bx - 1; ox <= bx + 1; ox++) {
            const m = inkMismatch(refL, clL, cb, ox, oy);
            if (m != null) r = Math.min(r, m);
          }
        if (Number.isFinite(r)) worst = Math.max(worst, r);
      }
    }
    const ratio = worst;
    ratios.push(round4(ratio));
    if (ratio > GLYPH_MAX) glyph.push({ ...at(w), ratio: round4(ratio) });
  }
  glyph.sort((a, b) => b.ratio - a.ratio);
  return { hidden, glyph, checked, ratios, screenColor };
}

/**
 * Evalúa una página del clon contra el PDF original (ya en disco). No guarda
 * nada: `compareRender` sube el montaje; la batería lo escribe a disco.
 *
 * Todo sale de UN artefacto: el clon impreso a PDF (sin JavaScript). Texto,
 * fuentes, posición, visibilidad, forma y composición se miden sobre ese PDF; la
 * única captura de pantalla es para el desborde.
 */
export async function evaluatePage(
  renderer: Renderer,
  pdfPath: string,
  _pdf: Buffer,
  page: number,
  html: string,
  t: Thresholds,
  workDir: string,
  waitMs?: number
): Promise<EvaluatedPage> {
  const orig = await readStext(pdfPath, page);
  if (!orig.width) throw new Error(`el PDF no tiene página ${page}`);
  const origWords = toWords(orig.chars);
  const g = geometry(orig.width, orig.height);
  const base: EvaluatedPage = {
    page,
    pass: false,
    pageCss: { width: g.cssW, height: g.cssH },
    trusted: false,
    overflow: { x: 0, y: 0 },
    scanned: origWords.length < MIN_WORDS,
    violations: [],
    text: null,
    liveText: null,
    layout: null,
    pixel: null,
    regions: [],
    reasons: [],
    montage: null,
  };

  // 1. Política: sin esto no vale la pena renderizar.
  const violations = htmlViolations(html);
  if (violations.length) {
    return { ...base, violations, reasons: violations.map((v) => `El clon ${v}.`) };
  }

  // 2. Renders: el PDF dos veces (determinismo) y una captura (desborde).
  const pdfOpts = { width: g.cssW, height: g.cssH, widthIn: g.widthPt / 72, heightIn: g.heightPt / 72, waitMs };
  const clonePath = path.join(workDir, `clone-p${page}.pdf`);
  const clone2Path = path.join(workDir, `clone-p${page}-b.pdf`);
  await fs.writeFile(clonePath, await renderer.pdf(html, pdfOpts));
  await fs.writeFile(clone2Path, await renderer.pdf(html, pdfOpts));
  // Captura en pantalla a la misma densidad que el raster: sirve para el desborde
  // y para comprobar que la pantalla muestra lo mismo que se imprime (Chrome pinta
  // distinto en cada uno cosas como mix-blend-mode, aun sin @media).
  const shot = await renderer.screenshot(html, { width: g.cssW, height: g.cssH, dsf: g.dsf, waitMs });

  // 3. Rasters con el mismo motor.
  const [refRaw, cloneRaw, clone2Raw, noTextRaw] = await Promise.all([
    rasterize(pdfPath, page, g.rasterW),
    rasterize(clonePath, 1, g.rasterW),
    rasterize(clone2Path, 1, g.rasterW),
    rasterize(clonePath, 1, g.rasterW, true),
  ]);
  const [refBuf, cloneBuf, clone2Buf, noTextBuf] = await Promise.all(
    [refRaw, cloneRaw, clone2Raw, noTextRaw].map((b) => cropTo(b, g.rasterW, g.rasterH))
  );

  // Una tercera impresión antes de declarar el render inestable: una web font que
  // llega tarde a UNA de las dos no debe reprobar a un clon honesto.
  let trusted = sameImage(cloneBuf, clone2Buf);
  if (!trusted) {
    const clone3Path = path.join(workDir, `clone-p${page}-c.pdf`);
    await fs.writeFile(clone3Path, await renderer.pdf(html, pdfOpts));
    const third = await cropTo(await rasterize(clone3Path, 1, g.rasterW), g.rasterW, g.rasterH);
    trusted = sameImage(third, cloneBuf) || sameImage(third, clone2Buf);
  }
  const shotOver = overflowOf(shot, g.rasterW, g.rasterH, g.dsf);
  const shotBuf = await cropTo(shot, g.rasterW, g.rasterH);
  const sc = await compareImages(cloneBuf, shotBuf);
  // Promedio Y peor celda: un efecto sólo-pantalla sobre una tarjeta mueve poco el promedio.
  const screen = sc.layout;
  const screenCell = sc.worstCell;
  const extraPages = (await pageCount(clonePath)) - 1;
  const overflow = { x: shotOver.x, y: Math.max(shotOver.y, extraPages > 0 ? g.cssH * extraPages : 0) };
  const m = await compareImages(refBuf, cloneBuf);
  const ptToPx = g.rasterW / g.widthPt;

  let text: TextReport | null = null;
  let live: { share: number | null; baked: number[] } = { share: null, baked: [] };
  let words: WordChecks = { hidden: [], glyph: [], checked: 0, ratios: [], screenColor: [] };
  let notInSource: string[] = [];
  if (!base.scanned) {
    const cand = await readStext(clonePath, 1);
    const { placed, ...report } = matchText(origWords, cand.chars, t.tolerancePt);
    words = await checkWords(refBuf, cloneBuf, noTextBuf, placed, ptToPx, shotBuf);
    live = await liveTextShare(refBuf, noTextBuf, orig.lines, ptToPx);
    const src = sourceText(html);
    notInSource = [...new Set(origWords.map((w) => w.text).filter((w) => !src.includes(w.replace(/\s+/g, ""))))];
    text = {
      ...report,
      hidden: words.checked ? round4(words.hidden.length / words.checked) : 0,
      glyphs: words.checked ? round4(1 - words.glyph.length / words.checked) : null,
      hiddenWords: words.hidden.slice(0, 5),
      glyphMismatches: words.glyph.slice(0, 5),
      glyphRatios: words.ratios,
      notInSource: notInSource.slice(0, 10),
    };
  }

  // 4. Motivos, en el orden en que conviene arreglarlos.
  const reasons: string[] = [];
  if (base.scanned) reasons.push("PDF sin capa de texto (escaneado): sólo se midió la composición visual.");
  if (!trusted) {
    reasons.push("El HTML no se imprime igual dos veces (animaciones o fuentes que cargan tarde): quítalas o sube waitMs. Mientras tanto ningún número es confiable.");
  }
  if (overflow.y) reasons.push(`El contenido se sale ${overflow.y} px por abajo de la página (${g.cssW}×${g.cssH}).`);
  if (overflow.x) reasons.push(`El contenido se sale ${overflow.x} px por la derecha de la página (${g.cssW}×${g.cssH}).`);
  if (live.baked.length) {
    reasons.push(`${live.baked.length} línea(s) de texto se ven dentro de una imagen, no como texto. El texto debe ser texto del DOM.`);
  }
  if (text) {
    if (text.missing > 0) {
      const gone = text.misplaced.filter((m) => m.dx == null).map((m) => `«${m.word}» (${m.x},${m.y})`);
      reasons.push(`Falta ${pct(text.missing)} del texto del original${gone.length ? `: ${gone.join(", ")}` : ""}.`);
    }
    if (notInSource.length) {
      reasons.push(`Texto que no está en el HTML (¿generado con CSS o una fuente?): ${notInSource.slice(0, 5).map((w) => `«${w}»`).join(", ")}.`);
    }
    if (words.hidden.length) {
      reasons.push(`${words.hidden.length} palabra(s) existen pero no se ven (tapadas o invisibles): ${words.hidden.slice(0, 5).map((w) => `«${w.word}» (${w.x},${w.y})`).join(", ")}.`);
    }
    const off = round4(1 - text.matched - text.missing);
    if (off > 0 && text.matched < t.text) {
      reasons.push(`${pct(off)} del texto está a más de ${t.tolerancePt} pt de su lugar (ver text.misplaced: dx/dy en pt).`);
    }
    if (text.invented) reasons.push(`El clon tiene texto que el original no: «${text.invented}».`);
    if (text.typography != null && text.typography < t.typography) {
      const ex = text.fontMismatches[0];
      const f = (x: FontInfo) => `${x.family} ${x.size}pt peso ${x.weight}${x.italic ? " cursiva" : ""} ${x.color}`;
      const es: Record<string, string> = {
        family: "familia",
        size: "tamaño",
        weight: "peso",
        style: "cursiva",
        color: "color",
        width: `ancho ${ex?.widthPt.original}→${ex?.widthPt.clone} pt (espaciado de letras o métricas de la fuente)`,
      };
      reasons.push(
        `${pct(1 - text.typography)} del texto usa otra tipografía` +
          (ex ? ` (p. ej. «${ex.word}»: original ${f(ex.original)} → clon ${f(ex.clone)}; difiere: ${ex.differs.map((d) => es[d] ?? d).join(", ")})` : "") +
          `. Fuentes del original: ${text.originalFonts.join(", ")}.`
      );
    }
    if (words.glyph.length) {
      reasons.push(`${words.glyph.length} palabra(s) no se dibujan como en el original (otra forma de letra): ${words.glyph.slice(0, 5).map((w) => `«${w.word}» (${w.x},${w.y})`).join(", ")}.`);
    }
  }
  if (words.screenColor.length) {
    reasons.push(`${words.screenColor.length} palabra(s) se ven de otro color en pantalla que impresas: ${words.screenColor.slice(0, 5).map((w) => `«${w.word}» (${w.x},${w.y})`).join(", ")}.`);
  }
  if (screen > t.screen || screenCell > t.cell) {
    reasons.push(`El clon se ve distinto en pantalla que impreso (${pct(Math.max(screen, screenCell))} en la zona más distinta): quita efectos que el navegador imprime diferente (mix-blend-mode, filtros, transformaciones 3D).`);
  }
  if (m.worstCell > t.cell && m.layout <= t.layout) {
    const r0 = m.regions[0];
    const where = r0 ? ` cerca de (${Math.round(r0.x * (g.cssW / g.rasterW))},${Math.round(r0.y * (g.cssW / g.rasterW))})` : "";
    reasons.push(`La composición visual difiere en una zona pequeña${where}: falta o cambió una imagen, logo, recuadro o línea.`);
  }
  if (m.layout > t.layout) {
    reasons.push(`La composición visual difiere ${pct(m.layout)} (fondos, colores, tablas, formas): empieza por regions[0].`);
  }

  const pass =
    trusted &&
    !overflow.x &&
    !overflow.y &&
    screen <= t.screen &&
    screenCell <= t.cell &&
    words.screenColor.length === 0 &&
    m.layout <= t.layout &&
    m.worstCell <= t.cell &&
    (base.scanned ||
      (text != null &&
        text.missing === 0 &&
        notInSource.length === 0 &&
        live.baked.length === 0 &&
        words.hidden.length === 0 &&
        words.glyph.length === 0 &&
        !text.invented &&
        text.matched >= t.text &&
        (text.typography ?? 1) >= t.typography));

  const toCss = g.cssW / g.rasterW;
  return {
    ...base,
    pass,
    trusted,
    overflow,
    text,
    liveText: live.share,
    layout: m.layout,
    layoutWorstCell: m.worstCell,
    screen,
    pixel: m.pixel,
    regions: m.regions.map((r) => ({
      x: Math.round(r.x * toCss),
      y: Math.round(r.y * toCss),
      w: Math.round(r.w * toCss),
      h: Math.round(r.h * toCss),
      ratio: r.ratio,
    })),
    reasons,
    montage: m.montage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada del PDF
// ─────────────────────────────────────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  // loopback, no especificada, ULA (fc00::/7 — incluye la red interna fdaa:: de Fly), link-local
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

/**
 * Baja un PDF por URL. Sólo https y sólo destinos públicos: este fetch corre en
 * el server de EasyBits, que ve la red interna de Fly. Es mitigación (queda la
 * ventana de rebinding entre el lookup y el fetch), igual que fleet-vision.
 */
async function fetchPublicPdf(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("pdfUrl debe ser https");
  const addrs = await lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("pdfUrl apunta a una dirección no pública");
  }
  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`no se pudo leer pdfUrl (${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_PDF_BYTES) throw new Error("el PDF pasa de 50MB");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PDF_BYTES) throw new Error("el PDF pasa de 50MB");
  return buf;
}

async function loadPdf(ctx: AuthContext, input: CompareInput): Promise<Buffer> {
  let buf: Buffer;
  if (input.fileId) {
    const file = await db.file.findUnique({ where: { id: input.fileId } });
    if (!file || file.ownerId !== ctx.user.id) throw new Error("PDF no encontrado");
    const { getReadClientForPlatformFile, getClientForFile } = await import("../storage");
    const client = file.storageProviderId
      ? await getClientForFile(file.storageProviderId, ctx.user.id)
      : getReadClientForPlatformFile(file);
    const res = await fetch(await client.getReadUrl(file.storageKey));
    if (!res.ok) throw new Error("no se pudo leer el PDF");
    buf = Buffer.from(await res.arrayBuffer());
  } else if (input.pdfUrl) {
    buf = await fetchPublicPdf(input.pdfUrl);
  } else {
    throw new Error("pasa `fileId` o `pdfUrl` del PDF original");
  }
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("el archivo no es un PDF");
  return buf;
}


// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

export async function compareRender(
  ctx: AuthContext,
  input: CompareInput,
  renderer: Renderer = boxRenderer(ctx)
): Promise<CompareResult> {
  if (!input.pages?.length) throw new Error("pasa al menos una página en `pages`");
  if (input.pages.length > COMPARE_MAX_PAGES) {
    throw new Error(`máximo ${COMPARE_MAX_PAGES} páginas por llamada`);
  }
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };

  const pdf = await loadPdf(ctx, input);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compare-"));
  const pdfPath = path.join(dir, "ref.pdf");
  await fs.writeFile(pdfPath, pdf);

  const results: ComparePageResult[] = [];
  try {
    // En serie: cada página son cuatro renders en la caja del owner; en
    // paralelo sólo competirían por el mismo Chromium.
    for (const { page, html } of input.pages) {
      try {
        const { montage, ...r } = await evaluatePage(renderer, pdfPath, pdf, page, html, thresholds, dir, input.waitMs);
        const stored = montage ? await storeRender(ctx, montage, "image/png", `compare-p${page}`, "png") : null;
        results.push({ ...r, diffUrl: stored?.url ?? null });
      } catch (e) {
        const msg = (e as Error).message;
        results.push({
          page,
          pass: false,
          pageCss: { width: 0, height: 0 },
          trusted: false,
          overflow: { x: 0, y: 0 },
          scanned: false,
          violations: [],
          text: null,
          liveText: null,
          layout: null,
          pixel: null,
          regions: [],
          diffUrl: null,
          reasons: [msg],
          error: msg,
        });
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    pages: results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    thresholds,
  };
}
