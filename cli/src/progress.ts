// Operaciones largas (exportar un documento, renderizar un video): spinner en una terminal,
// renglones simples sin ella, y nada con --json (stdout es sólo del JSON; stderr queda limpio
// para que un agente no tenga que filtrar ruido).
import { writeFileSync } from "node:fs";
import type { Ctx } from "./types.js";
import { interactive } from "./auth.js";
import { CliError, EXIT } from "./errors.js";
import { t } from "./i18n.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type Progress = { update(label: string): void; stop(final?: string): void };

/** Spinner en stderr con el tiempo transcurrido; sin terminal, un renglón por cambio de etiqueta. */
export function progress(ctx: Ctx, label: string): Progress {
  const started = Date.now();
  const secs = () => Math.round((Date.now() - started) / 1000);
  if (ctx.json) return { update() {}, stop() {} };
  if (!interactive(ctx)) {
    let last = "";
    const line = (l: string) => {
      if (l !== last) process.stderr.write(`${l}\n`);
      last = l;
    };
    line(label);
    return { update: line, stop: (final) => final && process.stderr.write(`${final}\n`) };
  }
  let i = 0;
  let current = label;
  const draw = () => process.stderr.write(`\r\x1b[2K${FRAMES[i++ % FRAMES.length]} ${current} (${secs()}s)`);
  draw();
  const timer = setInterval(draw, 100);
  return {
    update(l) {
      current = l;
    },
    stop(final) {
      clearInterval(timer);
      process.stderr.write(`\r\x1b[2K${final ? `${final}\n` : ""}`);
    },
  };
}

/** Corre `work` con el spinner puesto; lo quita pase lo que pase. */
export async function withProgress<T>(ctx: Ctx, label: string, work: (p: Progress) => Promise<T>): Promise<T> {
  const p = progress(ctx, label);
  try {
    return await work(p);
  } finally {
    p.stop();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Baja una URL pública a un archivo local. Regresa los bytes escritos. */
export async function download(url: string, out: string, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new CliError(t(`Download failed (${res.status}): ${url}`, `Falló la descarga (${res.status}): ${url}`), EXIT.API);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  return buf.length;
}
