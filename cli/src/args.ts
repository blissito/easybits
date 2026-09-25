import type { Ctx } from "./types.js";
import { usageError } from "./errors.js";

/** Posicional obligatorio `i`; si falta, error de uso (exit 2) con la línea de uso. */
export function need(ctx: Ctx, i: number, name: string, usage: string): string {
  const v = ctx.args[i];
  if (v == null || v === "") throw usageError(`Missing <${name}>.`, usage);
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
  if (!Number.isInteger(n) || n < 0) throw usageError(`--${key} must be a non-negative integer.`, usage);
  return n;
}

/** Pares `KEY=VALUE` (de --env repetido o de posicionales) a objeto. */
export function pairs(items: string[], usage: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq < 1) throw usageError(`Expected KEY=VALUE, got "${item}".`, usage);
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
