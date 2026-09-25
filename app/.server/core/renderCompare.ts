/**
 * compare_render — un número determinista para saber si un clon quedó igual.
 *
 * Idea tomada de Builder (agent-native): el agente deja de depender de un humano
 * que diga "se ve bien" y itera contra una métrica fija. Por página:
 *
 *   referencia = la página del PDF rasterizada con pdftoppm (ancho 1200)
 *   candidato  = el HTML renderizado en la caja render-svc al MISMO tamaño, dos veces
 *
 * y devuelve:
 *   - `trusted`: las dos capturas salieron idénticas. Si no, el render no es
 *     determinista (fuentes cargando, animación) y cualquier número mentiría.
 *   - `pixel`: fracción de píxeles distintos a resolución completa (ruido de glifos incluido).
 *   - `layout`: lo mismo tras bajar a 400 px y difuminar — ignora el antialias y
 *     detecta lo que se movió o se partió distinto. ES EL QUE DECIDE.
 *   - `textCoverage`: fracción de palabras del PDF presentes como TEXTO en el HTML.
 *     Sin esto, pegar el PDF como imagen de fondo daría 0 % de diferencia y un
 *     clon que no se puede editar.
 *   - `regions`: las celdas (rejilla 4×4) con más diferencia, para saber dónde arreglar.
 *   - `diffUrl`: imagen referencia | candidato | diff en rojo, guardada en Files.
 *
 * Todo corre con piezas que ya existían: poppler (Dockerfile), la caja de render
 * (renderOnBox), sharp y pixelmatch. Sin infraestructura nueva.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { lookup } from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { pdfToImages } from "./pdfToImages";
import { renderOnBox } from "./renderClient";
import { storeRender } from "./fleetRender";

const execFileAsync = promisify(execFile);

export const COMPARE_MAX_PAGES = 20;
const REF_WIDTH = 1200;
const LAYOUT_WIDTH = 400;
const GRID = 4;
const TOP_REGIONS = 5;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const DEFAULT_THRESHOLDS = { layout: 0.02, textCoverage: 0.95 };

export interface ComparePageInput {
  /** Página del PDF, 1-based. */
  page: number;
  /** HTML completo y auto-contenido del clon de esa página. */
  html: string;
}

export interface CompareInput {
  /** PDF original en la librería del owner. Gana sobre pdfUrl. */
  fileId?: string;
  /** PDF original por URL pública https (así llegan los adjuntos del chat). */
  pdfUrl?: string;
  pages: ComparePageInput[];
  thresholds?: { layout?: number; textCoverage?: number };
  /** Espera extra antes de capturar el candidato (fuentes web lentas). */
  waitMs?: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fracción de píxeles distintos dentro de la celda. */
  ratio: number;
}

export interface ComparePageResult {
  page: number;
  pass: boolean;
  trusted: boolean;
  pixel: number | null;
  layout: number | null;
  textCoverage: number | null;
  regions: Region[];
  diffUrl: string | null;
  width: number;
  height: number;
  error?: string;
}

export interface CompareResult {
  pages: ComparePageResult[];
  passed: number;
  total: number;
  thresholds: { layout: number; textCoverage: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas puras (sin red ni caja) — lo que prueban los tests.
// ─────────────────────────────────────────────────────────────────────────────

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function decode(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

/** Ajusta un PNG a width×height exactos (el candidato puede salir 1 px distinto). */
async function fitTo(buf: Buffer, width: number, height: number): Promise<PNG> {
  const img = decode(buf);
  if (img.width === width && img.height === height) return img;
  const sharp = (await import("sharp")).default;
  return decode(await sharp(buf).resize(width, height, { fit: "fill" }).png().toBuffer());
}

/** Baja a LAYOUT_WIDTH y difumina: quita el ruido de glifos, deja la composición. */
async function layoutView(buf: Buffer, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buf)
    .resize(LAYOUT_WIDTH, height, { fit: "fill" })
    .blur(1)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/**
 * Las celdas de la rejilla con más píxeles marcados en rojo por pixelmatch.
 * `scale` lleva las coordenadas del diff a px de la página.
 */
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
          // diffColor es rojo puro; el fondo desvaído es gris (r=g=b), nunca choca.
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
  // Orden estable: más diferencia primero, luego arriba→abajo, izquierda→derecha.
  cells.sort((a, b) => b.ratio - a.ratio || a.y - b.y || a.x - b.x);
  return cells.slice(0, TOP_REGIONS);
}

export interface ImageMetrics {
  trusted: boolean;
  pixel: number;
  layout: number;
  regions: Region[];
  /** PNG ref | candidato | diff. */
  montage: Buffer;
}

/**
 * Compara la referencia contra dos capturas del candidato. La segunda captura
 * sólo sirve para comprobar que el render es determinista.
 */
export async function compareImages(ref: Buffer, cand: Buffer, candAgain: Buffer): Promise<ImageMetrics> {
  const r = decode(ref);
  const { width, height } = r;
  const c = await fitTo(cand, width, height);
  const c2 = await fitTo(candAgain, width, height);

  const trusted = pixelmatch(c.data, c2.data, undefined, width, height, { threshold: 0 }) === 0;

  // El número excluye antialias (ruido de glifos), pero la imagen pinta TODA
  // diferencia en rojo: un texto corrido pixelmatch a veces lo clasifica como
  // antialias, y un diff que lo esconde manda a buscar en el lugar equivocado.
  const diff = new PNG({ width, height });
  const px = pixelmatch(r.data, c.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
    diffColor: [255, 0, 0],
    aaColor: [255, 0, 0],
  });

  const lh = Math.max(1, Math.round((height * LAYOUT_WIDTH) / width));
  const [lr, lc] = await Promise.all([layoutView(ref, lh), layoutView(PNG.sync.write(c), lh)]);
  // Las regiones salen del diff de `layout`, el que decide: apuntan a lo que
  // tiene que bajar para pasar, no al ruido de fuentes.
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
    trusted,
    pixel: round4(px / (width * height)),
    layout: round4(lpx / (LAYOUT_WIDTH * lh)),
    regions: topRegions(ldiff, width / LAYOUT_WIDTH),
    montage,
  };
}

function words(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? []
  );
}

/** Texto visible del HTML: fuera scripts/estilos/tags, entidades básicas decodificadas. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/**
 * Fracción de palabras del PDF (con repeticiones) que aparecen como texto en el
 * HTML. `null` si el PDF casi no tiene texto (escaneado): ahí no hay contra qué medir.
 */
export function textCoverage(pdfText: string, html: string): number | null {
  const want = words(pdfText);
  if (want.length < 5) return null;
  const have = new Map<string, number>();
  for (const w of words(htmlText(html))) have.set(w, (have.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of want) {
    const n = have.get(w) ?? 0;
    if (n > 0) {
      hit++;
      have.set(w, n - 1);
    }
  }
  return round4(hit / want.length);
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

async function pageText(pdfPath: string, page: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-f", String(page), "-l", String(page), "-enc", "UTF-8", pdfPath, "-"],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
    );
    return stdout;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

export async function compareRender(ctx: AuthContext, input: CompareInput): Promise<CompareResult> {
  if (!input.pages?.length) throw new Error("pasa al menos una página en `pages`");
  if (input.pages.length > COMPARE_MAX_PAGES) {
    throw new Error(`máximo ${COMPARE_MAX_PAGES} páginas por llamada`);
  }
  const thresholds = {
    layout: input.thresholds?.layout ?? DEFAULT_THRESHOLDS.layout,
    textCoverage: input.thresholds?.textCoverage ?? DEFAULT_THRESHOLDS.textCoverage,
  };

  const pdf = await loadPdf(ctx, input);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compare-"));
  const pdfPath = path.join(dir, "ref.pdf");
  await fs.writeFile(pdfPath, pdf);

  const results: ComparePageResult[] = [];
  try {
    // En serie: cada página son dos renders en la caja del owner; en paralelo
    // sólo competirían por el mismo Chromium.
    for (const { page, html } of input.pages) {
      const base: ComparePageResult = {
        page,
        pass: false,
        trusted: false,
        pixel: null,
        layout: null,
        textCoverage: null,
        regions: [],
        diffUrl: null,
        width: 0,
        height: 0,
      };
      try {
        const [ref] = await pdfToImages(pdf, { page, maxWidth: REF_WIDTH });
        if (!ref) throw new Error(`el PDF no tiene página ${page}`);
        const refBuf = Buffer.from(ref.image, "base64");

        const shot = () =>
          renderOnBox(ctx, "screenshot", {
            html,
            viewport: { width: ref.width, height: ref.height },
            emulate: { deviceScaleFactor: 1 },
            ...(input.waitMs ? { waitMs: Math.round(input.waitMs) } : {}),
            screenshot: { type: "png", fullPage: false },
          });
        const a = await shot();
        const b = await shot();

        const m = await compareImages(refBuf, a.bytes, b.bytes);
        const coverage = textCoverage(await pageText(pdfPath, page), html);
        const stored = await storeRender(ctx, m.montage, "image/png", `compare-p${page}`, "png");

        results.push({
          ...base,
          trusted: m.trusted,
          pixel: m.pixel,
          layout: m.layout,
          textCoverage: coverage,
          regions: m.regions,
          diffUrl: stored.url,
          width: ref.width,
          height: ref.height,
          pass:
            m.trusted &&
            m.layout <= thresholds.layout &&
            (coverage ?? 1) >= thresholds.textCoverage,
        });
      } catch (e) {
        results.push({ ...base, error: (e as Error).message });
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
