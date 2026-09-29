import { existsSync, readFileSync } from "node:fs";
import type { Ctx } from "./types.js";
import { usageError } from "./errors.js";
import { t } from "./i18n.js";

/** Posicional obligatorio `i`; si falta, error de uso (exit 2) con la línea de uso. */
export function need(ctx: Ctx, i: number, name: string, usage: string): string {
  const v = ctx.args[i];
  if (v == null || v === "") throw usageError(t(`Missing <${name}>.`, `Falta <${name}>.`), usage);
  return v;
}

export function str(ctx: Ctx, key: string): string | undefined {
  const v = ctx.opts[key];
  return typeof v === "string" ? v : undefined;
}

export function bool(ctx: Ctx, key: string): boolean {
  return ctx.opts[key] === true;
}

export function list(ctx: Ctx, key: string): string[] {
  const v = ctx.opts[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
}

export function int(ctx: Ctx, key: string, usage: string): number | undefined {
  const v = str(ctx, key);
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw usageError(t(`--${key} must be a non-negative integer.`, `--${key} debe ser un entero no negativo.`), usage);
  return n;
}

/** Pares `KEY=VALUE` (de --env repetido o de posicionales) a objeto. */
export function pairs(items: string[], usage: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq < 1) throw usageError(t(`Expected KEY=VALUE, got "${item}".`, `Se esperaba KEY=VALUE y llegó "${item}".`), usage);
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

/** Lee stdin completo (para `files write` con tubería). */
export async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/**
 * La bandera `--dotenv`, para las hojas que aceptan `--env`. No se llama `--env-file`
 * (como docker) porque Node 22 revisa ese nombre aun después del script: con `-` o con un
 * archivo inexistente muere con «node: -: not found» (exit 9) antes de llegar aquí.
 */
export const ENV_FILE_OPTION = {
  dotenv: { type: "string", value: "path", description: "KEY=VALUE lines (dotenv); - reads stdin. Use it for secrets" },
} as const;

/**
 * Lee un archivo dotenv (`KEY=VALUE` por renglón; `#` comenta, `export ` opcional, comillas
 * se quitan). `-` = stdin. Los secretos no van en argv: los ve `ps` y se quedan en el
 * historial (clig.dev «Do not read secrets directly from flags»; así lo hacen
 * `gh secret set`, `wrangler secret put` y `vercel env add`).
 */
export async function readEnvFile(path: string, usage: string): Promise<Record<string, string>> {
  let text: string;
  if (path === "-") {
    if (process.stdin.isTTY) throw usageError(t("--dotenv - expects KEY=VALUE lines on stdin.", "--dotenv - espera renglones KEY=VALUE por stdin."), usage);
    text = (await readStdin()).toString("utf8");
  } else {
    if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
    text = readFileSync(path, "utf8");
  }
  const out: Record<string, string> = {};
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) throw usageError(`${path === "-" ? "stdin" : path}:${n + 1}: ${t("expected KEY=VALUE.", "se esperaba KEY=VALUE.")}`, usage);
    let v = m[2];
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0])) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** `--dotenv` primero y `--env` encima (lo explícito en la línea gana, como docker). */
export async function envFrom(ctx: Ctx, usage: string): Promise<Record<string, string>> {
  const file = str(ctx, "dotenv");
  return { ...(file ? await readEnvFile(file, usage) : {}), ...pairs(list(ctx, "env"), usage) };
}
