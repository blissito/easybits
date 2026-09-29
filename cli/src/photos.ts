// Fotos del catálogo (sin red): qué foto va a qué fila, de qué tipo es DE VERDAD y qué clase de
// liga tiene hoy una celda. Lo usan `db photos put` y `db tables`. Sin imports propios: el test
// lo carga directo.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/** 10 MB por foto (WhatsApp acepta hasta 5 MB por liga: lo de en medio se sube y se avisa). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const WHATSAPP_MAX_BYTES = 5 * 1024 * 1024;

/** El tipo REAL por los primeros bytes, nunca por la extensión. Sólo mapas de bits (nada de SVG). */
export function imageTypeOf(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type Photo = { key: string; file: string; path: string; mime: string; ext: string; bytes: number; sha: string };
export type Rejected = { file: string; reason: "not_an_image" | "too_large" | "empty" };

/** `SKU-123.jpg` → la fila con llave `SKU-123`. Ocultos y carpetas se ignoran; lo demás se explica. */
export function photoFiles(dir: string): { photos: Photo[]; rejected: Rejected[] } {
  const photos: Photo[] = [];
  const rejected: Rejected[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (!st.isFile()) continue;
    if (st.size === 0) {
      rejected.push({ file: name, reason: "empty" });
      continue;
    }
    if (st.size > PHOTO_MAX_BYTES) {
      rejected.push({ file: name, reason: "too_large" });
      continue;
    }
    const bytes = readFileSync(path);
    const type = imageTypeOf(bytes);
    if (!type) {
      rejected.push({ file: name, reason: "not_an_image" });
      continue;
    }
    const key = name.slice(0, name.length - extname(name).length);
    photos.push({ key, file: name, path, ...type, bytes: st.size, sha: createHash("sha256").update(bytes).digest("hex") });
  }
  return { photos, rejected };
}

export type LinkKind = "permanent" | "expiring" | "external" | "empty" | "other";

/** Liga PERMANENTE = el bucket público de EasyBits (o un dominio de easybits.cloud). */
export function linkKind(v: unknown): LinkKind {
  if (v == null || String(v).trim() === "") return "empty";
  const s = String(v).trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return "other";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "other";
  if (/X-Amz-Signature=|[?&]Signature=|[?&]sig=/i.test(u.search)) return "expiring";
  if (/^easybits-public\./.test(u.hostname) || u.hostname === "easybits.cloud" || u.hostname.endsWith(".easybits.cloud")) return "permanent";
  return "external";
}

const PHOTO_COLUMNS = ["image_url", "photo_url", "imagen_url", "foto_url", "image", "photo", "imagen", "foto", "img"];

/** La columna de la foto cuando no se pasa `--column`: la primera con nombre de foto. */
export function defaultPhotoColumn(columns: string[]): string | undefined {
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const c of PHOTO_COLUMNS) if (lower.has(c)) return lower.get(c);
  return undefined;
}

export type PhotoPlan = Array<{ key: string; file: string; action: "update" | "keep" | "no_row"; current?: string }>;

/** Qué pasa con cada foto dado lo que hay hoy en la columna. Sin `replace`, una liga permanente se queda. */
export function planPhotos(photos: Photo[], current: Map<string, unknown>, replace: boolean): PhotoPlan {
  return photos.map((p) => {
    if (!current.has(p.key)) return { key: p.key, file: p.file, action: "no_row" as const };
    const cur = current.get(p.key);
    const keep = !replace && linkKind(cur) === "permanent";
    return { key: p.key, file: p.file, action: keep ? ("keep" as const) : ("update" as const), ...(cur ? { current: String(cur) } : {}) };
  });
}

export type LinkStats = { column: string; permanent: number; expiring: number; external: number; empty: number };
const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;

/**
 * Una sola consulta que cuenta, por columna de texto, cuántas ligas son permanentes, firmadas
 * (caducan), de fuera o vacías. Mismo criterio que `linkKind`, en SQL para no bajar las filas.
 */
export function linkStatsSql(table: string, columns: string[]): string {
  const parts = columns.flatMap((c) => {
    const v = `trim(CAST(${ident(c)} AS TEXT))`;
    const url = `(${v} LIKE 'http://%' OR ${v} LIKE 'https://%')`;
    const exp = `(${v} LIKE '%X-Amz-Signature=%' OR ${v} LIKE '%?Signature=%' OR ${v} LIKE '%&Signature=%')`;
    const perm = `(${v} LIKE 'https://easybits-public.%' OR ${v} LIKE 'http%://easybits.cloud/%' OR ${v} LIKE 'http%.easybits.cloud/%')`;
    return [
      `SUM(CASE WHEN ${url} AND NOT ${exp} AND ${perm} THEN 1 ELSE 0 END)`,
      `SUM(CASE WHEN ${url} AND ${exp} THEN 1 ELSE 0 END)`,
      `SUM(CASE WHEN ${url} AND NOT ${exp} AND NOT ${perm} THEN 1 ELSE 0 END)`,
      `SUM(CASE WHEN ${ident(c)} IS NULL OR ${v} = '' THEN 1 ELSE 0 END)`,
    ];
  });
  return `SELECT ${parts.join(", ")} FROM ${ident(table)}`;
}

/** El renglón de `linkStatsSql` → sólo las columnas que tienen al menos una liga. */
export function parseLinkStats(columns: string[], row: unknown[]): LinkStats[] {
  const n = (i: number) => Number(row[i] ?? 0) || 0;
  return columns
    .map((column, i) => ({ column, permanent: n(i * 4), expiring: n(i * 4 + 1), external: n(i * 4 + 2), empty: n(i * 4 + 3) }))
    .filter((s) => s.permanent + s.expiring + s.external > 0);
}
