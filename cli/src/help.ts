import type { Command, Leaf } from "./types.js";
import { COMMANDS } from "./commands/index.js";
import { SSH_CONFIG_SNIPPET } from "./commands/ssh.js";
import { lang, t } from "./i18n.js";
import { HELP_ES } from "./help.es.js";

/** Un texto de la ayuda en el idioma de la corrida (help.es.ts; sin traducción, tal cual). */
export const h = (en: string | undefined): string => (en && lang() === "es" ? HELP_ES[en] ?? en : en ?? "");

/** Un ejemplo con su comentario `# …` traducido; el comando queda igual. */
export function example(line: string): string {
  const i = line.indexOf("# ");
  if (i === -1 || lang() !== "es") return line;
  return line.slice(0, i + 2) + h(line.slice(i + 2).trim());
}

const GLOBAL_FLAGS_EN = `Global flags:
  --json           Machine output: JSON on stdout, errors included
  --token <key>    API key for this call (prefer EASYBITS_API_KEY: argv leaks to ps)
  --lang <es|en>   Language (default: from LANG; also EASYBITS_LANG)
  -h, --help       Help (also: easybits <command> --help)
  -v, --version    Print the CLI version

Naming (like gh): noun then verb — easybits <noun> <verb>. Old spellings still work
and print the new one on stderr (never with --json).

Names or ids: agents, sandboxes/machines and databases take either
(exact, case-insensitive; two with the same name → exit 2 with the ids).

Deletes (sandboxes destroy, agents destroy, db rm, domains rm, files rm, agents files|skills rm)
ask first; without a terminal or with --json pass -y/--yes, or they exit 2.
Agent writes (agents set|create|files|skills|mcp) take --dry-run: show the change, touch nothing.

Env: EASYBITS_API_KEY (API key), EASYBITS_URL (API server, default https://www.easybits.cloud),
     EASYBITS_NO_UPDATE_CHECK=1 (no daily "update available" notice on stderr)

Exit codes: 0 ok, 1 API error, 2 usage error, 3 not logged in or bad key`;

const GLOBAL_FLAGS_ES = `Flags globales:
  --json           Salida para máquinas: JSON en stdout, errores incluidos
  --token <key>    API key para esta llamada (mejor EASYBITS_API_KEY: argv se ve en ps)
  --lang <es|en>   Idioma (default: el de LANG; también EASYBITS_LANG)
  -h, --help       Ayuda (también: easybits <comando> --help)
  -v, --version    Imprime la versión del CLI

Nombres (como gh): sustantivo y luego verbo — easybits <sustantivo> <verbo>. Las formas
viejas siguen funcionando y avisan la nueva en stderr (nunca con --json).

Nombres o ids: agentes, sandboxes/máquinas y bases aceptan cualquiera de los dos
(exacto, sin distinguir mayúsculas; dos con el mismo nombre → sale con 2 y los ids).

Los borrados (sandboxes destroy, agents destroy, db rm, domains rm, files rm, agents files|skills rm)
preguntan antes; sin terminal o con --json pasa -y/--yes, o salen con 2.
Lo que escribe en un agente (agents set|create|files|skills|mcp) acepta --dry-run: enseña el
cambio y no toca nada.

Env: EASYBITS_API_KEY (API key), EASYBITS_URL (servidor de la API, default https://www.easybits.cloud),
     EASYBITS_NO_UPDATE_CHECK=1 (sin el aviso diario de versión nueva en stderr)

Códigos de salida: 0 ok, 1 error de la API, 2 error de uso, 3 sin sesión o key inválida`;

export const globalFlags = () => (lang() === "es" ? GLOBAL_FLAGS_ES : GLOBAL_FLAGS_EN);

const COL = 17;

export function globalHelp(version: string): string {
  const groups = new Map<string, Command[]>();
  for (const c of COMMANDS) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const lines = [
    `easybits ${version} — ${t("the cloud for AI agents, from your terminal", "la nube para agentes de IA, desde tu terminal")}`,
    "",
    t("Usage: easybits <command> [subcommand] [args] [flags]", "Uso: easybits <comando> [subcomando] [args] [flags]"),
    "",
  ];
  for (const [group, cmds] of groups) {
    lines.push(`${h(group)}:`);
    for (const c of cmds) {
      lines.push(`  ${c.synopsis.padEnd(COL)}${h(c.summary)}`);
      // Los subcomandos en un segundo renglón: la ayuda cabe en 80 columnas.
      if (c.subs) {
        // Varios renglones si no caben (agents tiene muchos subcomandos).
        let row = "";
        for (const n of Object.keys(c.subs)) {
          if (row && row.length + 1 + n.length > 80 - 2 - COL) {
            lines.push(`  ${"".padEnd(COL)}${row}`);
            row = n;
          } else row = row ? `${row} ${n}` : n;
        }
        if (row) lines.push(`  ${"".padEnd(COL)}${row}`);
      }
    }
    lines.push("");
  }
  lines.push(globalFlags(), "", t("SSH to a sandbox — add to ~/.ssh/config:", "SSH a un sandbox — agrega a ~/.ssh/config:"), indent(SSH_CONFIG_SNIPPET, 2), "");
  lines.push(t("Docs: https://www.easybits.cloud/en/docs/cli.md  (or: easybits docs cli --en)", "Docs: https://www.easybits.cloud/docs/cli.md  (o: easybits docs cli)"));
  return lines.join("\n");
}

export function commandHelp(c: Command): string {
  if (c.leaf) return leafHelp(c.leaf);
  const subs = Object.entries(c.subs ?? {});
  const width = Math.max(...subs.map(([n]) => n.length)) + 2;
  const lines = [`easybits ${c.name} — ${h(c.summary)}`, "", t(`Usage: easybits ${c.name} <subcommand> [args] [flags]`, `Uso: easybits ${c.name} <subcomando> [args] [flags]`), ""];
  if (c.aliases?.length) lines.push(`${t("Aliases", "Alias")}: ${c.aliases.join(", ")}`, "");
  lines.push(t("Subcommands:", "Subcomandos:"));
  for (const [n, l] of subs) lines.push(`  ${n.padEnd(width)}${h(l.summary)}`);
  lines.push("", t(`Run: easybits ${c.name} <subcommand> --help`, `Corre: easybits ${c.name} <subcomando> --help`));
  return lines.join("\n");
}

export function leafHelp(l: Leaf): string {
  const lines = [h(l.summary), "", `${t("Usage", "Uso")}: ${l.usage}`];
  if (l.aliases?.length) lines.push(`${t("Aliases", "Alias")}: ${l.aliases.join(", ")}`);
  const opts = Object.entries(l.options ?? {});
  if (opts.length) {
    const flag = ([n, o]: [string, (typeof opts)[number][1]]) =>
      `${o.short ? `-${o.short}, ` : ""}--${n}${o.type === "string" ? ` <${o.value ?? "value"}>` : ""}`;
    const width = Math.max(...opts.map((o) => flag(o).length)) + 2;
    lines.push("", "Flags:");
    for (const o of opts) lines.push(`  ${flag(o).padEnd(width)}${h(o[1].description)}`);
  }
  if (l.examples?.length) {
    lines.push("", t("Examples:", "Ejemplos:"));
    for (const e of l.examples) lines.push(`  ${example(e)}`);
  }
  lines.push("", t("Add --json for machine output.", "Agrega --json para salida de máquina."));
  return lines.join("\n");
}

function indent(s: string, n: number) {
  return s
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");
}
