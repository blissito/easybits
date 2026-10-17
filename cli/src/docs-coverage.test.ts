// Regla de bliss: ningún comando sin sus docs públicos. Este test cruza la tabla COMMANDS
// contra los cuatro lugares donde se documenta el CLI (README, docs ES y EN, skill) en las dos
// direcciones: todo comando aparece en cada uno, y nada documentado deja de existir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS } from "./commands/index.ts";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

/** Sólo la sección `cli` de reference.ts (el archivo trae todas las secciones). */
function esSection(): string {
  const src = read("app/.server/docs/reference.ts");
  const start = src.indexOf("cli: `## CLI");
  const end = src.indexOf("\n  files: `", start);
  assert.ok(start !== -1 && end !== -1, "no encontré la sección cli de reference.ts");
  return src.slice(start, end);
}

const DOCS: Record<string, string> = {
  "cli/README.md": read("cli/README.md"),
  "reference.ts (cli)": esSection(),
  "reference.en.cli.ts": read("app/.server/docs/reference.en.cli.ts"),
  "public/skills/easybits-cli/SKILL.md": read("public/skills/easybits-cli/SKILL.md"),
};

// Comandos para personas en una terminal: la skill (para agentes) no tiene por qué enseñarlos.
const NOT_FOR_AGENTS = new Set(["completion", "ssh-key", "ssh-proxy"]);

/** `easybits <comando> [<sub>]` por cada hoja, en la forma canónica. */
function leaves(): Array<{ cmd: string; sub?: string }> {
  const out: Array<{ cmd: string; sub?: string }> = [];
  for (const c of COMMANDS) {
    if (c.leaf) out.push({ cmd: c.name });
    for (const s of Object.keys(c.subs ?? {})) out.push({ cmd: c.name, sub: s });
  }
  return out;
}

/** El texto menciona `easybits <cmd> <sub>` (o el alias del comando, como `sb`). */
function mentions(text: string, cmd: string, sub?: string): boolean {
  const c = COMMANDS.find((x) => x.name === cmd)!;
  const names = [c.name, ...(c.aliases ?? [])].map((n) => n.replace(/[-]/g, "\\-"));
  const tail = sub ? `[ \\t]+${sub.replace(/[-]/g, "\\-")}(?![\\w-])` : "(?![\\w-])";
  return new RegExp(`easybits[ \\t]+(?:${names.join("|")})${tail}`).test(text);
}

for (const [file, text] of Object.entries(DOCS)) {
  test(`${file}: documenta cada comando de COMMANDS`, () => {
    const missing = leaves()
      .filter(({ cmd }) => !(file.includes("SKILL") && NOT_FOR_AGENTS.has(cmd)))
      .filter(({ cmd, sub }) => !mentions(text, cmd, sub))
      .map(({ cmd, sub }) => `easybits ${cmd}${sub ? ` ${sub}` : ""}`);
    assert.deepEqual(missing, [], `faltan en ${file}`);
  });

  test(`${file}: no documenta comandos que no existen`, () => {
    // Formas viejas que normalizeArgs (aliases.ts) traduce: siguen siendo válidas.
    const legacy = new Set(["config", "deploy"]);
    const bad: string[] = [];
    for (const m of text.matchAll(/easybits[ \t]+([a-z][\w-]*)(?:[ \t]+([a-z][\w-]*))?/g)) {
      const [, name, sub] = m;
      if (legacy.has(name) || name === "help" || name === "login" || name === "logout") continue;
      const c = COMMANDS.find((x) => x.name === name || x.aliases?.includes(name));
      if (!c) {
        // Prosa («easybits es la terminal…», «easybits-cli»): sólo cuenta si parece comando.
        if (/^(is|es|wraps|from|cli|skill|skills|from)$/.test(name)) continue;
        bad.push(m[0]);
        continue;
      }
      if (c.subs && sub && !c.subs[sub] && !Object.values(c.subs).some((l) => l.aliases?.includes(sub))) {
        // `files` y `sites` tienen un sub por defecto; `docs`/`agents`… no: un sub desconocido es error.
        if (!c.defaultSub) bad.push(m[0]);
      }
    }
    assert.deepEqual([...new Set(bad)], [], `comandos fantasma en ${file}`);
  });
}
