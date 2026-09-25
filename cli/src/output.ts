import type { Ctx } from "./types.js";

/** Con --json imprime `data` en stdout; si no, corre la salida para humanos. */
export function emit(ctx: Ctx, data: unknown, human: () => void): void {
  if (ctx.json) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  else human();
}

export function fmtBytes(n: number | undefined | null): string {
  if (n == null) return "-";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 16).replace("T", " ");
}

/** Tabla de texto plano con columnas alineadas. `empty` se imprime si no hay filas. */
export function table(
  rows: Array<Record<string, unknown>>,
  cols: Array<[key: string, label: string]>,
  empty = "Nothing here yet.",
): void {
  if (rows.length === 0) {
    console.log(empty);
    return;
  }
  const cell = (v: unknown) => (v == null || v === "" ? "-" : String(v));
  const widths = cols.map(([k, label]) =>
    Math.min(48, Math.max(label.length, ...rows.map((r) => cell(r[k]).length))),
  );
  const line = (vals: string[]) =>
    vals
      .map((v, i) => (i === vals.length - 1 ? v : v.slice(0, widths[i]).padEnd(widths[i])))
      .join("  ")
      .trimEnd();
  console.log(line(cols.map(([, l]) => l)));
  for (const r of rows) console.log(line(cols.map(([k]) => cell(r[k]))));
}
