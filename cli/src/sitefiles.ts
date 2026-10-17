// Archivos de un sitio estático: tipo MIME por extensión y el recorrido de una carpeta local
// (lo que sube `easybits websites deploy`). Sin red; el test lo carga directo.
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  map: "application/json",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  zip: "application/zip",
  wasm: "application/wasm",
};

export function mimeOf(path: string): string {
  return MIME[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream";
}

// Lo que nunca se publica: control de versiones, dependencias y archivos ocultos (.env).
const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Archivos de `dir` con su ruta relativa en formato URL (`css/app.css`), ordenados. */
export function walkSite(dir: string): Array<{ path: string; local: string; size: number }> {
  const out: Array<{ path: string; local: string; size: number }> = [];
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.isFile()) out.push({ path: relative(dir, full).split(sep).join("/"), local: full, size: statSync(full).size });
    }
  };
  visit(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Ruta dentro del sitio: sin `/` inicial ni `..` (la API la pega al prefijo del sitio). */
export function sitePath(p: string): string | null {
  const clean = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((s) => s === ".." || s === "")) return null;
  return clean;
}
