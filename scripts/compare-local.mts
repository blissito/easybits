// Evalúa UN clon HTML contra una página de un PDF con el mismo núcleo que
// producción (evaluatePage), pintado con Chrome local en vez de la caja.
//
//   npx tsx --tsconfig tsconfig.json scripts/compare-local.mts <pdf> <página> <clon.html> [--out dir]
//
// Imprime el resultado en JSON (sin el montaje) y guarda <out>/diff.png.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { DEFAULT_THRESHOLDS, evaluatePage, type Renderer } from "../app/.server/core/renderCompare";

const [pdfArg, pageArg, htmlArg] = process.argv.slice(2);
if (!pdfArg || !pageArg || !htmlArg) {
  console.error("uso: compare-local.mts <pdf> <página> <clon.html> [--out dir]");
  process.exit(2);
}
const i = process.argv.indexOf("--out");
const out = path.resolve(i > 0 ? process.argv[i + 1] : path.join(os.tmpdir(), "compare-local"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
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

const pdfPath = path.resolve(pdfArg);
const { montage, ...r } = await evaluatePage(
  renderer,
  pdfPath,
  readFileSync(pdfPath),
  Number(pageArg),
  readFileSync(path.resolve(htmlArg), "utf8"),
  { ...DEFAULT_THRESHOLDS },
  out
);
if (montage) writeFileSync(path.join(out, "diff.png"), montage);
await browser.close();
console.log(JSON.stringify(r, null, 2));
