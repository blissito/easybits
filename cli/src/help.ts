import type { Command, Leaf } from "./types.js";
import { COMMANDS } from "./commands/index.js";
import { SSH_CONFIG_SNIPPET } from "./commands/ssh.js";

export const GLOBAL_FLAGS = `Global flags:
  --json           Machine output: JSON on stdout, errors included
  --token <key>    API key for this call (EASYBITS_API_KEY wins if set)
  -h, --help       Help (also: easybits <command> --help)
  -v, --version    Print the CLI version

Exit codes: 0 ok, 1 API error, 2 usage error, 3 not logged in or bad key`;

const COL = 17;

export function globalHelp(version: string): string {
  const groups = new Map<string, Command[]>();
  for (const c of COMMANDS) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const lines = [`easybits ${version} — the cloud for AI agents, from your terminal`, "", "Usage: easybits <command> [subcommand] [args] [flags]", ""];
  for (const [group, cmds] of groups) {
    lines.push(`${group}:`);
    for (const c of cmds) {
      lines.push(`  ${c.synopsis.padEnd(COL)}${c.summary}`);
      // Los subcomandos en un segundo renglón: la ayuda cabe en 80 columnas.
      if (c.subs) lines.push(`  ${"".padEnd(COL)}${Object.keys(c.subs).join(" ")}`);
    }
    lines.push("");
  }
  lines.push(GLOBAL_FLAGS, "", "SSH to a sandbox — add to ~/.ssh/config:", indent(SSH_CONFIG_SNIPPET, 2), "");
  lines.push("Docs: https://www.easybits.cloud/docs/cli.md  (or: easybits docs cli)");
  return lines.join("\n");
}

export function commandHelp(c: Command): string {
  if (c.leaf) return leafHelp(c.leaf);
  const subs = Object.entries(c.subs ?? {});
  const width = Math.max(...subs.map(([n]) => n.length)) + 2;
  const lines = [`easybits ${c.name} — ${c.summary}`, "", `Usage: easybits ${c.name} <subcommand> [args] [flags]`, ""];
  if (c.aliases?.length) lines.push(`Aliases: ${c.aliases.join(", ")}`, "");
  lines.push("Subcommands:");
  for (const [n, l] of subs) lines.push(`  ${n.padEnd(width)}${l.summary}`);
  lines.push("", `Run: easybits ${c.name} <subcommand> --help`);
  return lines.join("\n");
}

export function leafHelp(l: Leaf): string {
  const lines = [l.summary, "", `Usage: ${l.usage}`];
  if (l.aliases?.length) lines.push(`Aliases: ${l.aliases.join(", ")}`);
  const opts = Object.entries(l.options ?? {});
  if (opts.length) {
    const flag = ([n, o]: [string, (typeof opts)[number][1]]) =>
      `${o.short ? `-${o.short}, ` : ""}--${n}${o.type === "string" ? ` <${o.value ?? "value"}>` : ""}`;
    const width = Math.max(...opts.map((o) => flag(o).length)) + 2;
    lines.push("", "Flags:");
    for (const o of opts) lines.push(`  ${flag(o).padEnd(width)}${o[1].description ?? ""}`);
  }
  if (l.examples?.length) {
    lines.push("", "Examples:");
    for (const e of l.examples) lines.push(`  ${e}`);
  }
  lines.push("", "Add --json for machine output.");
  return lines.join("\n");
}

function indent(s: string, n: number) {
  return s
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");
}
