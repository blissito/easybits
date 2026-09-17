// Rellena los bloques generados de los archivos de prosa pública (skills, READMEs
// de paquetes, openapi.yaml…) a partir de las fuentes únicas del servidor:
//
//   <!-- generated:templates -->
//   …tabla…                         ← lo escribe este script, no una persona
//   <!-- /generated -->
//
//   npm run check:docs   → falla (código 1) si algún bloque está desfasado
//   npm run docs:sync    → reescribe los bloques
//
// Corre en `prebuild` ANTES de skills-pack, así el digest de cada skill ya lleva
// el bloque al día y `npx skills update` lo detecta. Bloques disponibles:
//   templates            tabla markdown de templates públicos (ES)
//   templates-en         idem en inglés
//   templates-inline     lista corta "ubuntu, python, …" (para prosa)
//   sandbox-actions      lista de acciones de POST /sandboxes/:id/:action
//   tool-groups          tabla de grupos MCP (key, descripción)
//   packages             versiones actuales de los paquetes npm
// En YAML el marcador va como comentario `# generated:templates-yaml` … `# /generated`
// y el bloque es el enum indentado (ver openapi.yaml).
import { readFileSync, writeFileSync } from "node:fs";
import { TEMPLATE_CATALOG, publicTemplates, templatesMarkdownTable, templatesInline } from "../app/.server/sandbox/templateCatalog";
import { SANDBOX_ACTIONS } from "../app/.server/sandbox/schemas";
import { TOOL_GROUPS } from "../app/.server/mcp/toolGroups";

const ROOT = new URL("../", import.meta.url).pathname;
const write = process.argv.includes("--write");

const pkgVersion = (dir: string) => JSON.parse(readFileSync(`${ROOT}packages/${dir}/package.json`, "utf8")) as { name: string; version: string };

const BLOCKS: Record<string, () => string> = {
  templates: () => templatesMarkdownTable("es"),
  "templates-en": () => templatesMarkdownTable("en"),
  "templates-inline": () => templatesInline(["base", "agent"]),
  "sandbox-actions": () => SANDBOX_ACTIONS.map((a) => `- \`${a}\``).join("\n"),
  "tool-groups": () =>
    ["| Grupo | Qué incluye |", "|---|---|", ...TOOL_GROUPS.map((g) => `| \`${g.key}\` | ${g.description} |`)].join("\n"),
  packages: () =>
    ["mcp", "sdk", "eve-sandbox"]
      .map(pkgVersion)
      .map((p) => `- \`${p.name}@${p.version}\``)
      .join("\n"),
  // YAML: enum indentado a 10 espacios (bajo `schema:` de un parámetro/propiedad).
  "templates-yaml": () => publicTemplates().map((t) => `          - ${t}`).join("\n"),
  "actions-yaml": () => SANDBOX_ACTIONS.map((a) => `          - ${a}`).join("\n"),
  "templates-yaml-desc": () =>
    publicTemplates(["base", "agent"])
      .map((t) => `          ${t}: ${TEMPLATE_CATALOG[t].summaryEn}`)
      .join("\n"),
};

// Archivos con bloques. Añadir uno nuevo = ponerle marcadores y listarlo aquí.
const FILES = [
  "public/skills/easybits/references/api.md",
  "public/skills/easybits/references/mcp.md",
  "public/skills/easybits-sandbox/SKILL.md",
  "public/skills/easybits-mcp/SKILL.md",
  "public/skills/easybits-eve/SKILL.md",
  "packages/sdk/README.md",
  "packages/mcp/README.md",
  "packages/eve-sandbox/README.md",
  "public/openapi.yaml",
];

// Markdown: <!-- generated:X --> … <!-- /generated -->   YAML: # generated:X … # /generated
const MD = /(<!-- generated:([a-z-]+) -->\n)([\s\S]*?)(<!-- \/generated -->)/g;
const YAML = /(^[ \t]*# generated:([a-z-]+)\n)([\s\S]*?)(^[ \t]*# \/generated)/gm;

let stale = 0;
let seen = 0;
for (const rel of FILES) {
  const path = ROOT + rel;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(`docs-sync: no existe ${rel}`);
    process.exitCode = 1;
    continue;
  }
  const re = rel.endsWith(".yaml") ? YAML : MD;
  const next = text.replace(re, (_m, open: string, name: string, _body: string, close: string) => {
    const gen = BLOCKS[name];
    if (!gen) {
      console.error(`docs-sync: bloque desconocido "${name}" en ${rel}`);
      process.exitCode = 1;
      return _m;
    }
    seen++;
    return `${open}${gen()}\n${close}`;
  });
  if (next !== text) {
    stale++;
    if (write) {
      writeFileSync(path, next);
      console.log(`docs-sync: actualizado ${rel}`);
    } else {
      console.error(`docs-sync: DESFASADO ${rel} (corre npm run docs:sync)`);
    }
  }
}
if (!write && stale) process.exitCode = 1;
if (!process.exitCode) console.log(`docs-sync: ${seen} bloques al día en ${FILES.length} archivos`);
