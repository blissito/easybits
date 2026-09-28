import { createInterface } from "node:readline/promises";
import type { Ctx } from "./types.js";
import { bool } from "./args.js";
import { CliError, EXIT } from "./errors.js";
import { interactive } from "./auth.js";

/** La bandera que salta la confirmación; se agrega a cada hoja destructiva. */
export const YES_OPTION = {
  yes: { type: "boolean", short: "y", description: "Skip the confirmation (required without a terminal)" },
} as const;

/** El comando tal como se tecleó, para la pista «Run: … --yes». */
function sameCommand(): string {
  const argv = process.argv.slice(2).map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`));
  return `easybits ${argv.join(" ")}`;
}

async function ask(question: string): Promise<string> {
  // En stderr: stdout es de los datos (y de --json), nunca de las preguntas.
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } catch {
    // Ctrl+D / Ctrl+C a media pregunta = «no», no un error de API.
    process.stderr.write("\n");
    return "";
  } finally {
    rl.close();
  }
}

/**
 * Falla rápido sin terminal y sin --yes: se llama al inicio de la hoja, antes de pedir
 * credenciales o tocar la API, para que el error sea siempre el mismo (exit 2).
 */
export function requireYesIfHeadless(ctx: Ctx): void {
  if (bool(ctx, "yes") || interactive(ctx)) return;
  throw new CliError("--yes required when not running interactively.", EXIT.USAGE, `Run: ${sameCommand()} --yes`, "usage");
}

/**
 * Confirmación de una acción destructiva. Patrón de clig.dev («Confirm before doing
 * anything dangerous») y de gh («--yes required when not running interactively»):
 * - con --yes/-y no pregunta;
 * - sin terminal (agente, CI, --json) NUNCA se queda colgado: sale con 2 y la pista;
 * - con terminal pregunta [y/N] en stderr; si `typeName` viene, hay que teclear el nombre
 *   del recurso, como `gh repo delete` o `heroku pg:reset --confirm <app>`.
 */
export async function confirm(ctx: Ctx, action: string, opts: { typeName?: string } = {}): Promise<void> {
  if (bool(ctx, "yes")) return;
  requireYesIfHeadless(ctx);
  if (opts.typeName) {
    process.stderr.write(`${action}\nThis cannot be undone.\n`);
    const answer = await ask(`Type "${opts.typeName}" to confirm: `);
    if (answer !== opts.typeName) throw new CliError("Aborted: the name did not match.", EXIT.USAGE, undefined, "aborted");
    return;
  }
  const answer = await ask(`${action} [y/N] `);
  // Cancelar sale con 2, igual que gh (CancelError → exit 2).
  if (!/^y(es)?$/i.test(answer)) throw new CliError("Aborted.", EXIT.USAGE, undefined, "aborted");
}
