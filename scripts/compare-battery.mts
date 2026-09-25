// Batería de compare_render: clones que DEBEN pasar y trampas que DEBEN fallar,
// generados desde el propio PDF y evaluados con el mismo núcleo que producción
// (evaluatePage), pintados con Chrome local en vez de la caja.
//
//   npx tsx --tsconfig tsconfig.json scripts/compare-battery.mts <pdf> <página> [--out dir] [--only P1,C3]
//
// Criterio: todos bien clasificados Y por el motivo correcto (`expectReason`).
// Escribe cada HTML, su montaje (original | clon | diff) y report.json en --out.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import {
  DEFAULT_THRESHOLDS,
  evaluatePage,
  familyKey,
  geometry,
  readStext,
  toWords,
  type FontInfo,
  type Renderer,
  type Word,
} from "../app/.server/core/renderCompare";
import { pdfToImages } from "../app/.server/core/pdfToImages";

const [pdfArg, pageArg] = process.argv.slice(2);
if (!pdfArg || !pageArg) {
  console.error("uso: compare-battery.mts <pdf> <página> [--out dir] [--only P1,C3]");
  process.exit(2);
}
const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const PAGE = Number(pageArg);
const OUT = path.resolve(flag("out") ?? path.join(os.tmpdir(), `battery-p${PAGE}`));
const ONLY = flag("only")?.split(",");
mkdirSync(OUT, { recursive: true });

const pdfPath = path.resolve(pdfArg);
const pdf = readFileSync(pdfPath);

// ── Renderer local (mismo contrato que la caja) ─────────────────────────────
const browser: Browser = await chromium.launch({ channel: "chrome" });
async function withPage<T>(html: string, viewport: { width: number; height: number }, dsf: number, fn: (p: any) => Promise<T>) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  try {
    return await fn(p);
  } finally {
    await ctx.close();
  }
}
const renderer: Renderer = {
  screenshot: (html, o) =>
    withPage(html, { width: o.width, height: o.height }, o.dsf, async (p) => {
      if (o.waitMs) await p.waitForTimeout(o.waitMs);
      return p.screenshot({ type: "png", fullPage: true });
    }),
  pdf: (html, o) =>
    withPage(html, { width: o.width, height: o.height }, 1, (p) =>
      p.pdf({
        width: `${o.widthIn}in`,
        height: `${o.heightIn}in`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      })
    ),
};

// ── Original ────────────────────────────────────────────────────────────────
const orig = await readStext(pdfPath, PAGE);
const words = toWords(orig.chars);
const g = geometry(orig.width, orig.height);
const [refImg] = await pdfToImages(pdf, { page: PAGE, maxWidth: 1200 });
const refPng = Buffer.from(refImg.image, "base64");
const s = g.rasterW / orig.width; // pt → px del raster
const k = 4 / 3; // pt → px CSS

// Familia CSS para cada fuente del original: la misma (web font si es de Google).
const GOOGLE: Record<string, string> = {
  notosans: "Noto Sans",
  notoserif: "Noto Serif",
  montserrat: "Montserrat",
  roboto: "Roboto",
  opensans: "Open Sans",
  lato: "Lato",
  inter: "Inter",
};
const LOCAL: Record<string, string> = { arial: "Arial", times: "Times New Roman", courier: "Courier New", calibri: "Carlito, Calibri" };
function cssFamily(f?: FontInfo): string {
  const key = f ? familyKey(f.family) : "arial";
  return GOOGLE[key] ? `'${GOOGLE[key]}'` : LOCAL[key] ?? `'${f?.family ?? "Arial"}'`;
}
const googleFamilies = [...new Set(words.map((w) => GOOGLE[familyKey(w.font.family)]).filter(Boolean))];
const fontLink = googleFamilies.length
  ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${googleFamilies
      .map((f) => `family=${encodeURIComponent(f)}:ital,wght@0,100..900;1,100..900`)
      .join("&")}&display=block">`
  : "";

// ── Calibración: dónde queda la línea base de un span ───────────────────────
// Para una fuente F a tamaño S con top T y line-height 1, la línea base cae en
// T + b·S. Con eso el clon pone el origen de cada palabra donde el original.
const calCache = new Map<string, number>();
async function calibrate(family: string, weight: number): Promise<number> {
  const key = `${family}|${weight}`;
  if (calCache.has(key)) return calCache.get(key)!;
  const html = `<meta charset="utf-8">${fontLink}<body style="margin:0"><span style="position:absolute;left:100px;top:100px;font:${weight} 100px/1 ${family};white-space:pre">Hxgé</span></body>`;
  const f = path.join(OUT, `calib-${key.replace(/\W+/g, "")}.pdf`);
  writeFileSync(f, await renderer.pdf(html, { width: 800, height: 400, widthIn: 800 / 96, heightIn: 400 / 96 }));
  const ch = (await readStext(f, 1)).chars.find((c) => c.c === "H")!;
  const b = (ch.y * k - 100) / 100;
  calCache.set(key, b);
  return b;
}

// ── Colores y fondo sin texto ───────────────────────────────────────────────
const raw = await (async () => {
  const { data, info } = await sharp(refPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
})();
function bgAround(x0: number, y0: number, x1: number, y1: number) {
  const px = (x: number, y: number) => {
    const xx = Math.min(raw.w - 1, Math.max(0, Math.round(x)));
    const yy = Math.min(raw.h - 1, Math.max(0, Math.round(y)));
    const i = (yy * raw.w + xx) * 4;
    return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
  };
  const border: number[][] = [];
  for (let x = x0 - 2; x <= x1 + 2; x += 2) border.push(px(x, y0 - 2), px(x, y1 + 2));
  for (let y = y0; y <= y1; y += 2) border.push(px(x0 - 2, y), px(x1 + 2, y));
  const med = (i: number) => border.map((c) => c[i]).sort((a, b) => a - b)[border.length >> 1];
  return `rgb(${med(0)},${med(1)},${med(2)})`;
}
// El raster original con cada palabra tapada del color de su alrededor: el fondo
// que extraería un clonador serio (pdf2htmlEX), para poner el texto vivo encima.
const erase = orig.lines
  .map((l) => {
    const pad = 1.5;
    const [x0, y0, x1, y1] = [l.xMin * s, l.yMin * s, l.xMax * s, l.yMax * s];
    return `<rect x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + 2 * pad}" height="${y1 - y0 + 2 * pad}" fill="${bgAround(x0, y0, x1, y1)}"/>`;
  })
  .join("");
const bgPng = await sharp(refPng)
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${raw.w}" height="${raw.h}">${erase}</svg>`), left: 0, top: 0 }])
  .png()
  .toBuffer();
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function page(inner: string, { bg = true, css = "" } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">${fontLink}<style>
html,body{margin:0}
body{width:${g.cssW}px;height:${g.cssH}px;position:relative;${bg ? `background:url(${dataUrl(bgPng)}) 0 0/100% 100% no-repeat;` : ""}}
.w{position:absolute;white-space:pre;line-height:1}
${css}</style></head><body>${inner}</body></html>`;
}

interface SpanOpts {
  words?: Word[];
  family?: string; // fuerza otra familia
  noBold?: boolean;
  color?: string; // fuerza color
  noSpacing?: boolean; // sin letter-spacing: ancho natural de la fuente
  flatten?: boolean; // superíndices y fracciones como texto normal (m² → m2)
  dx?: number;
  dy?: number;
}
/** Ancho natural (px CSS) de cada palabra con su estilo, medido en el navegador con las fuentes cargadas. */
async function naturalWidths(list: { text: string; css: string }[]): Promise<number[]> {
  return withPage(`<meta charset="utf-8">${fontLink}<body>${list.map((x) => `<span style="font:${x.css}">.</span>`).join("")}</body>`, { width: 800, height: 600 }, 1, (p) =>
    p.evaluate((items: { text: string; css: string }[]) => {
      const c = document.createElement("canvas").getContext("2d")!;
      return items.map((x) => {
        c.font = x.css;
        return c.measureText(x.text).width;
      });
    }, list)
  );
}

/**
 * Una palabra por span, con la fuente, tamaño, peso y color del original, y el
 * letter-spacing que reproduce el espaciado de caracteres del PDF (Tc): sin él,
 * los números de una tabla exportada de Word chocan con la columna siguiente.
 */
let spacingMatters = false; // ¿alguna palabra, sin su espaciado, sale de la tolerancia de ancho?
async function spans(o: SpanOpts = {}) {
  const list = o.words ?? words;
  const styles = list.map((w) => {
    const f = w.font;
    const family = o.family ?? cssFamily(f);
    const weight = o.noBold ? 400 : f.weight;
    const bold = weight >= 600;
    const size = f.size * k;
    return { w, f, family, bold, weight, size, css: `${f.italic ? "italic " : ""}${weight} ${size}px/1 ${family}` };
  });
  const natural = await naturalWidths(styles.map((x) => ({ text: x.w.text, css: x.css })));
  const out: string[] = [];
  for (const [i, x] of styles.entries()) {
    const b = await calibrate(x.family, x.weight);
    const top = x.w.y * k - b * x.size;
    const n = [...x.w.text].length;
    const ls = n > 1 && !o.noSpacing ? (x.w.width * k - natural[i]) / (n - 1) : 0;
    if (!o.words && !o.family && !o.noBold && !o.color && !o.noSpacing) {
      const diffPt = Math.abs(x.w.width * k - natural[i]) / k;
      if (diffPt > Math.max(1.5, x.w.width * 0.08)) spacingMatters = true;
    }
    out.push(
      `<span class="w" style="left:${(x.w.x * k + (o.dx ?? 0)).toFixed(2)}px;top:${(top + (o.dy ?? 0)).toFixed(2)}px;` +
        `font:${x.css};letter-spacing:${ls.toFixed(3)}px;color:${o.color ?? x.f.color}">${esc(o.flatten ? x.w.text.normalize("NFKC") : x.w.text)}</span>`
    );
  }
  return out.join("");
}

const imgTag = (style = "") =>
  `<img src="${dataUrl(refPng)}" style="position:absolute;left:0;top:0;width:${g.cssW}px;height:${g.cssH}px;${style}">`;
const plain = execFileSync("pdftotext", ["-f", String(PAGE), "-l", String(PAGE), "-enc", "UTF-8", pdfPath, "-"]).toString();

// La zona de 60×60 px CSS con más tinta que NO es texto (del original sin texto).
const graphic = await (async () => {
  const noText = execFileSync("mutool", ["draw", "-q", "-K", "-F", "png", "-w", String(g.cssW), "-o", "-", pdfPath, String(PAGE)], { maxBuffer: 1 << 28 });
  const { data, info } = await sharp(noText).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  let best: { x: number; y: number; ink: number } | null = null;
  for (let y = 0; y + 60 < info.height; y += 10)
    for (let x = 0; x + 60 < info.width; x += 10) {
      let ink = 0;
      for (let yy = y; yy < y + 60; yy += 2) for (let xx = x; xx < x + 60; xx += 2) if (data[yy * info.width + xx] < 200) ink++;
      if (!best || ink > best.ink) best = { x, y, ink };
    }
  if (!best || best.ink < 200) return null; // página sin gráficas
  const { data: c } = await sharp(noText).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = ((best.y - 5 < 0 ? best.y + 65 : best.y - 5) * info.width + best.x) * 3;
  return { x: best.x, y: best.y, bg: `rgb(${c[i]},${c[i + 1]},${c[i + 2]})` };
})();

type Case = { id: string; expect: "pass" | "fail" | "skip"; why: string; expectReason?: RegExp; html: string; build?: () => Promise<string> };
const cases: Case[] = [
  { id: "P1", expect: "pass", why: "fondo extraído + texto vivo en su lugar con la fuente, tamaño, peso y color del original", html: page(await spans()) },
  { id: "P2", expect: "fail", why: "P1 con Georgia → otra familia", expectReason: /tipografía/, html: page(await spans({ family: "Georgia" })) },
  {
    id: "P3",
    // Sólo es defecto si el original tiene negritas.
    expect: words.some((w) => w.font.weight >= 600) ? "fail" : "skip",
    why: "P1 sin negritas → otro peso",
    expectReason: /tipografía/,
    html: page(await spans({ noBold: true })),
  },
  { id: "P4", expect: "fail", why: "P1 todo en gris → otro color", expectReason: /tipografía/, html: page(await spans({ color: "#999" })) },
  {
    id: "P5",
    // Sólo es trampa si el original usa espaciado de caracteres (Tc); si no, es idéntico a P1.
    expect: spacingMatters ? "fail" : "skip",
    why: "P1 sin el espaciado del PDF → palabras que chocan",
    expectReason: /ancho/,
    html: page(await spans({ noSpacing: true })),
  },
  {
    id: "L",
    // Sólo aplica si el original tiene superíndices o fracciones.
    expect: words.some((w) => /[²³¹⁰-⁹½¼¾]/.test(w.text)) ? "fail" : "skip",
    why: "P1 con m² → m2 (superíndices y fracciones aplanados)",
    expectReason: /Falta|no existe/,
    html: page(await spans({ flatten: true })),
  },
  { id: "A", expect: "fail", why: "imagen del PDF sola", expectReason: /imagen|Falta/, html: page(imgTag(), { bg: false }) },
  { id: "B", expect: "fail", why: "imagen + texto display:none", expectReason: /imagen|no se ven/, html: page(`${imgTag()}<div style="display:none">${esc(plain)}</div>`, { bg: false }) },
  { id: "C", expect: "fail", why: "imagen + texto transparente en su lugar", expectReason: /imagen|no se ven/, html: page(imgTag() + (await spans({ color: "transparent" })), { bg: false }) },
  { id: "C3", expect: "fail", why: "imagen + texto visible encima, exacto", expectReason: /imagen|no se ven/, html: page(imgTag() + (await spans()), { bg: false }) },
  { id: "C4", expect: "fail", why: "imagen + texto visible corrido 2 px (fantasma)", expectReason: /imagen|no se ven/, html: page(imgTag() + (await spans({ dx: 2, dy: 2 })), { bg: false }) },
  { id: "K", expect: "fail", why: "imagen corrida −3 px + texto transparente", expectReason: /imagen|no se ven/, html: page(imgTag("left:-3px;top:-3px") + (await spans({ color: "transparent" })), { bg: false }) },
  { id: "K2", expect: "fail", why: "imagen difuminada + texto transparente", expectReason: /imagen|no se ven/, html: page(imgTag("filter:blur(1px)") + (await spans({ color: "transparent" })), { bg: false }) },
  {
    id: "D",
    expect: "fail",
    why: "texto crudo sin posiciones",
    expectReason: /lugar|sale/,
    html: page(`<div style="padding:60px;font:15px sans-serif;white-space:pre-wrap">${esc(plain)}</div>`, { bg: false }),
  },
  {
    id: "E",
    expect: "fail",
    why: "P1 empujado 400 px",
    expectReason: /por abajo/,
    html: page(`<div style="position:relative;top:400px;height:${g.cssH}px">${await spans()}</div>`),
  },
  {
    id: "H",
    expect: "fail",
    why: "P1 + elemento 400 px más ancho",
    expectReason: /por la derecha/,
    html: page((await spans()) + `<div style="position:absolute;top:0;left:0;width:${g.cssW + 400}px;height:10px"></div>`),
  },
  { id: "F", expect: "fail", why: "P1 sin 1 de cada 5 palabras", expectReason: /Falta/, html: page(await spans({ words: words.filter((_, i) => i % 5 !== 0) })) },
  {
    id: "I",
    expect: "fail",
    why: "P1 + 25 % de texto inventado",
    expectReason: /no existe en el original|original no/,
    html: page(
      (await spans()) +
        `<div style="position:absolute;left:40px;bottom:8px;font:6px sans-serif;width:${g.cssW - 80}px">${Array.from(
          { length: Math.ceil(words.length / 4) },
          (_, i) => `inventada${i}`
        ).join(" ")}</div>`
    ),
  },
  // ── Técnicas del red team (ronda 1), en versión genérica ──
  {
    id: "M",
    expect: "fail",
    why: "@media print: se imprime el clon fiel, en pantalla otra cosa",
    expectReason: /@media/,
    html: page(`<div class="scr">${imgTag()}</div><div class="prn">${await spans()}</div>`, { css: "@media print{.scr{display:none}} @media screen{.prn{display:none}}" }),
  },
  (() => {
    const w0 = words.find((w) => w.text.length > 3) ?? words[0];
    const x = w0.x * k, y = (w0.y - w0.font.size) * k, wd = w0.width * k + 4, h = w0.font.size * 1.4 * k;
    return {
      id: "W",
      expect: "fail" as const,
      why: `una palabra tapada con un recuadro («${w0.text}»)`,
      expectReason: /no se ven|forma de letra|composición/,
      html: "",
      build: async () => page((await spans()) + `<div style="position:absolute;left:${x}px;top:${y}px;width:${wd}px;height:${h}px;background:#fff"></div>`),
    };
  })(),
  (() => {
    const l = orig.lines[Math.floor(orig.lines.length / 2)];
    const clip = `inset(${(l.yMin * k).toFixed(1)}px ${(g.cssW - l.xMax * k).toFixed(1)}px ${(g.cssH - l.yMax * k).toFixed(1)}px ${(l.xMin * k).toFixed(1)}px)`;
    return {
      id: "O",
      expect: "fail" as const,
      why: "una línea horneada (imagen del original) sobre su texto vivo",
      expectReason: /imagen|no se ven|forma/,
      html: "",
      build: async () => page((await spans()) + imgTag(`clip-path:${clip}`)),
    };
  })(),
  { id: "HR", expect: "fail", why: "fondo con el tono rotado", expectReason: /composición|Falta|imagen/, html: "", build: async () => page(await spans(), { css: "body{filter:hue-rotate(150deg)}" }) },
  { id: "BL", expect: "fail", why: "texto con mix-blend-mode (pantalla ≠ impresión)", expectReason: /mix-blend|pantalla/, html: "", build: async () => page(await spans(), { css: ".w{mix-blend-mode:difference}" }) },
  {
    id: "PC",
    expect: "fail",
    why: "texto generado con CSS content",
    expectReason: /content/,
    html: page(words.map((w) => `<span class="w" data-t="${esc(w.text)}" style="left:${(w.x * k).toFixed(1)}px;top:${((w.y - w.font.size) * k).toFixed(1)}px;font-size:${(w.font.size * k).toFixed(1)}px"></span>`).join(""), { css: ".w::before{content:attr(data-t)}" }),
  },
  {
    id: "X2",
    expect: "fail",
    why: "dos caracteres sobrepuestos que el original no tiene",
    expectReason: /original no/,
    html: "",
    build: async () => {
      const w0 = words[Math.floor(words.length / 2)];
      return page((await spans()) + `<span class="w" style="left:${(w0.x * k).toFixed(1)}px;top:${((w0.y + w0.font.size * 1.3) * k).toFixed(1)}px;font:${w0.font.size * k}px/1 Arial">94</span>`);
    },
  },
  {
    id: "LG",
    // Borra la gráfica sin texto más fuerte de la página (logo, recuadro de color): 60×60 px CSS.
    expect: graphic ? "fail" : "skip",
    why: "un logo / recuadro borrado (cambio local pequeño)",
    expectReason: /composición/,
    html: "",
    build: async () =>
      page((await spans()) + (graphic ? `<div style="position:absolute;left:${graphic.x}px;top:${graphic.y}px;width:60px;height:60px;background:${graphic.bg}"></div>` : "")),
  },
  { id: "G", expect: "fail", why: "página en blanco", expectReason: /Falta/, html: page("", { bg: false }) },
  {
    id: "J",
    expect: "fail",
    why: "texto dibujado en <canvas>",
    expectReason: /script|Falta/,
    html: page(
      `<canvas id="c" width="${g.cssW}" height="${g.cssH}" style="position:absolute;left:0;top:0"></canvas><script>
const c=document.getElementById('c').getContext('2d');
const W=${JSON.stringify(words.map((w) => [w.text, w.x * k, w.y * k, w.font.size * k, w.font.color]))};
for(const [t,x,y,sz,col] of W){c.font=sz+'px Arial';c.fillStyle=col;c.fillText(t,x,y);}
</script>`
    ),
  },
];

// ── Correr ──────────────────────────────────────────────────────────────────
const rows: any[] = [];
for (const c of cases) {
  if (ONLY && !ONLY.includes(c.id)) continue;
  if (c.expect === "skip") {
    console.log(`– ${c.id.padEnd(3)} no aplica a este PDF (${c.why})`);
    continue;
  }
  if (c.build) c.html = await c.build();
  writeFileSync(path.join(OUT, `${c.id}.html`), c.html);
  const r = await evaluatePage(renderer, pdfPath, pdf, PAGE, c.html, DEFAULT_THRESHOLDS, OUT);
  if (r.montage) writeFileSync(path.join(OUT, `${c.id}-diff.png`), r.montage);
  const got = r.pass ? "pass" : "fail";
  const reasonOk = c.expect === "pass" || !c.expectReason || r.reasons.some((x) => c.expectReason!.test(x));
  const ok = got === c.expect && reasonOk;
  const t = r.text;
  rows.push({ id: c.id, ok, expect: c.expect, got, reasonOk, why: c.why, trusted: r.trusted, overflow: r.overflow, text: t, liveText: r.liveText, layout: r.layout, pixel: r.pixel, reasons: r.reasons });
  console.log(
    `${ok ? "✓" : "✗"} ${c.id.padEnd(3)} esperado ${c.expect} obtuvo ${got}${reasonOk ? "" : " (MOTIVO EQUIVOCADO)"}  ` +
      `texto ${t?.matched ?? "—"} falta ${t?.missing ?? "—"} extra ${t?.extra ?? "—"} tipo ${t?.typography ?? "—"}  ` +
      `vivo ${r.liveText ?? "—"}  layout ${r.layout} celda ${r.layoutWorstCell ?? "—"}  desborde ${r.overflow.x}/${r.overflow.y}${r.trusted ? "" : "  NO-DETERMINISTA"}`
  );
  for (const why of r.reasons) console.log(`      · ${why}`);
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ pdf: pdfPath, page: PAGE, rows }, null, 2));
await browser.close();
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} bien clasificados · ${OUT}`);
process.exit(bad.length ? 1 : 0);
