import { createInterface } from "node:readline/promises";
import type { Ctx } from "./types.js";
import { bool } from "./args.js";
import { CliError, EXIT } from "./errors.js";
import { interactive } from "./auth.js";
import { t } from "./i18n.js";

/** La bandera que salta la confirmación; se agrega a cada hoja destructiva. */
export const YES_OPTION = {
  yes: { type: "boolean", short: "y", description: "Skip the confirmation (required without a terminal or with --json)" },
} as const;

/** El comando tal como se tecleó, para la pista «Run: … --yes». */
function sameCommand(argv: string[] = process.argv.slice(2)): string {
  const quoted = argv.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`));
  return `easybits ${quoted.join(" ")}`;
}

/**
 * El comando de verdad tras un --dry-run: el mismo sin --dry-run y, si la hoja confirma
 * (`needsYes`) y no hay terminal, ya con --yes. Un agente de código copia la línea tal cual
 * y sin el --yes falla con exit 2 (feedback Deník Leads #7 en `ghosty`).
 */
export function applyCommand(argv: string[], opts: { headless: boolean; needsYes?: boolean }): string {
  const rest = argv.filter((a) => a !== "--dry-run");
  const hasYes = rest.some((a) => a === "--yes" || a === "-y");
  return `${sameCommand(rest)}${opts.needsYes && opts.headless && !hasYes ? " --yes" : ""}`;
}

/** La línea «Para aplicarlo: …» que cierra la salida de un --dry-run. */
export function applyHint(ctx: Ctx, opts: { needsYes?: boolean } = {}): string {
  const cmd = applyCommand(process.argv.slice(2), { headless: !interactive(ctx), needsYes: opts.needsYes });
  return t(`To apply: ${cmd}`, `Para aplicarlo: ${cmd}`);
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
  throw new CliError(t("--yes required when not running interactively.", "Sin terminal hace falta --yes."), EXIT.USAGE, `${t("Run", "Corre")}: ${sameCommand()} --yes`, "usage");
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
    process.stderr.write(`${action}\n${t("This cannot be undone.", "No se puede deshacer.")}\n`);
    const answer = await ask(t(`Type "${opts.typeName}" to confirm: `, `Teclea "${opts.typeName}" para confirmar: `));
    if (answer !== opts.typeName) throw new CliError(t("Aborted: the name did not match.", "Cancelado: el nombre no coincide."), EXIT.USAGE, undefined, "aborted");
    return;
  }
  const answer = await ask(`${action} ${t("[y/N]", "[s/N]")} `);
  // Cancelar sale con 2, igual que gh (CancelError → exit 2).
  if (!/^(y(es)?|s[ií]?)$/i.test(answer)) throw new CliError(t("Aborted.", "Cancelado."), EXIT.USAGE, undefined, "aborted");
}
