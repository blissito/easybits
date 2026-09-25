// Línea base: qué tan fieles son hoy los clones de presentationClone (Gemini + juez suave 1–10)
// medidos con compare_render (el mismo núcleo que producción, pintado con Chrome local).
//
//   npx tsx --tsconfig tsconfig.json scripts/clone-baseline.mts <pdf>:<página> […] [--out dir] [--model id] [--iterations n]
//
// Cada página se clona al tamaño CSS de la página del PDF (pt × 4/3), que es el contrato de
// compare_render. Escribe <out>/<nombre>-p<N>.html y report.json, e imprime una tabla.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { DEFAULT_THRESHOLDS, evaluatePage, geometry, readStext, type Renderer } from "../app/.server/core/renderCompare";
import { cloneSingleSlide } from "../app/.server/core/presentationClone";
import { pdfToImages } from "../app/.server/core/pdfToImages";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(flag("out") ?? path.join(os.tmpdir(), "clone-baseline"));
// Modelo e iteraciones del clonador (presentationClone usa gemini-2.5-pro y 3 vueltas por defecto).
const MODEL = flag("model");
const ITER = Number(flag("iterations") ?? 3);
const targets = args.filter((a) => /\.pdf:\d+$/.test(a));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
async function withPage<T>(html: string, viewport: { width: number; height: number }, dsf: number, fn: (p: any) => Promise<T>) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  try { return await fn(p); } finally { await ctx.close(); }
}
const renderer: Renderer = {
  screenshot: (html, o) => withPage(html, { width: o.width, height: o.height }, o.dsf, (p) => p.screenshot({ type: "png", fullPage: true })),
  pdf: (html, o) => withPage(html, { width: o.width, height: o.height }, 1, (p) =>
    p.pdf({ width: `${o.widthIn}in`, height: `${o.heightIn}in`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } })),
};

const rows: any[] = [];
for (const t of targets) {
  const [file, pg] = t.split(":");
  const page = Number(pg);
  const pdfPath = path.resolve(file);
  const pdf = readFileSync(pdfPath);
  const st = await readStext(pdfPath, page);
  const g = geometry(st.width, st.height);
  const [img] = await pdfToImages(pdf, { page, maxWidth: 1200 });
  const name = `${path.basename(file, ".pdf")}-p${page}`;
  const t0 = Date.now();
  let html = "";
  try {
    html = await cloneSingleSlide(img.image, g.cssW, g.cssH, ITER, MODEL);
  } catch (e) {
    rows.push({ name, error: `clonar falló: ${(e as Error).message}` });
    console.log(`✗ ${name}: clonar falló — ${(e as Error).message}`);
    continue;
  }
  writeFileSync(path.join(OUT, `${name}.html`), html);
  const r = await evaluatePage(renderer, pdfPath, pdf, page, html, { ...DEFAULT_THRESHOLDS }, OUT);
  if (r.montage) writeFileSync(path.join(OUT, `${name}-diff.png`), r.montage);
  const row = {
    name, secs: Math.round((Date.now() - t0) / 1000), pass: r.pass, violations: r.violations,
    matched: r.text?.matched ?? null, missing: r.text?.missing ?? null, typography: r.text?.typography ?? null,
    liveText: r.liveText, layout: r.layout, cell: (r as any).layoutWorstCell ?? null, overflow: r.overflow, reasons: r.reasons,
  };
  rows.push(row);
  console.log(`${r.pass ? "✓" : "✗"} ${name} (${row.secs}s)  texto ${row.matched} falta ${row.missing} tipo ${row.typography} vivo ${row.liveText} layout ${row.layout} celda ${row.cell}`);
  for (const why of r.reasons.slice(0, 3)) console.log(`      · ${why}`);
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rows, null, 2));
await browser.close();
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} pasan · ${OUT}`);
