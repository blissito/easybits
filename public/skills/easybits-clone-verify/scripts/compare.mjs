#!/usr/bin/env node
/**
 * Verifica el clon HTML de un PDF contra el original, página por página, con
 * POST /api/v2/render/compare. Sin dependencias (Node 18+).
 *
 *   node compare.mjs --pdf <fileId | https://…pdf> --dir <carpeta> [--pages 1,3] [--wait 500]
 *
 * <carpeta> tiene page-1.html, page-2.html… (una por página del PDF).
 * Escribe <carpeta>/compare-report.json e imprime una tabla corta con el primer motivo.
 *
 * Env: EASYBITS_API_KEY (requerida) · EASYBITS_BASE_URL (default https://www.easybits.cloud)
 * Salida: 0 = todas pasan · 1 = alguna no pasa · 2 = error de uso o de red
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function die(msg) {
  console.error(`compare: ${msg}`);
  process.exit(2);
}

const pdf = arg("pdf");
const dir = arg("dir");
const key = process.env.EASYBITS_API_KEY;
if (!pdf || !dir) die("uso: node compare.mjs --pdf <fileId|url> --dir <carpeta> [--pages 1,3] [--wait ms]");
if (!key) die("falta EASYBITS_API_KEY");

const wanted = arg("pages")?.split(",").map(Number).filter(Boolean);
const files = readdirSync(dir)
  .map((f) => ({ f, m: f.match(/^page-(\d+)\.html$/) }))
  .filter((x) => x.m)
  .map((x) => ({ page: Number(x.m[1]), file: join(dir, x.f) }))
  .filter((x) => !wanted || wanted.includes(x.page))
  .sort((a, b) => a.page - b.page);
if (!files.length) die(`no hay page-N.html en ${dir}`);

const base = (process.env.EASYBITS_BASE_URL || "https://www.easybits.cloud").replace(/\/+$/, "");
const all = [];
// La API acepta 20 páginas por llamada.
for (let i = 0; i < files.length; i += 20) {
  const chunk = files.slice(i, i + 20);
  const body = {
    ...(pdf.startsWith("https://") ? { pdfUrl: pdf } : { fileId: pdf }),
    pages: chunk.map((x) => ({ page: x.page, html: readFileSync(x.file, "utf8") })),
    ...(arg("wait") ? { waitMs: Number(arg("wait")) } : {}),
  };
  const res = await fetch(`${base}/api/v2/render/compare`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => die(e.message));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`${res.status} ${json.error || JSON.stringify(json)}`);
  all.push(...json.pages);
}

const report = { passed: all.filter((p) => p.pass).length, total: all.length, pages: all };
writeFileSync(join(dir, "compare-report.json"), JSON.stringify(report, null, 2));

const pct = (n) => (n == null ? "  —  " : `${(n * 100).toFixed(1).padStart(5)}%`);
console.log("pág  pasa  texto  tipo.  vivo   layout  motivo");
for (const p of all) {
  console.log(
    `${String(p.page).padStart(3)}  ${p.pass ? " sí " : " no "}  ${pct(p.text?.matched)}  ${pct(p.text?.typography)}  ${pct(p.liveText)}  ${pct(p.layout)}  ${p.reasons?.[0] ?? ""}`
  );
}
console.log(`\n${report.passed}/${report.total} pasan · detalle, reasons y diffUrl en ${join(dir, "compare-report.json")}`);
process.exit(report.passed === report.total ? 0 : 1);
