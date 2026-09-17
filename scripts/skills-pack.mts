// Empaqueta las skills públicas (`public/skills/<name>/`) para el descubrimiento por
// well-known en formato v0.2.0 (RFC de Cloudflare: `$schema` + `type`/`url`/`digest`).
//
//   npm run check:skills   → sólo valida (falla con código 1)
//   npm run skills:pack    → valida y escribe public/skills/index.json + los .tar.gz
//
// Corre en `prebuild`: react-router copia public/ a build/client, así que lo generado
// viaja con el deploy sin commitearse. Con `metadata.internal: "true"` la skill no entra
// al índice (sigue servible por su ruta, pero nadie la descubre).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../public/skills/", import.meta.url).pathname;
const SITE = "https://www.easybits.cloud";
const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const write = process.argv.includes("--write");
const problems: string[] = [];

/**
 * tar.gz reproducible en Node puro (ustar), sin depender del `tar` del sistema: bsdtar en
 * la Mac y GNU tar en el runner no aceptan las mismas banderas, y un mtime distinto cambiaría
 * el digest sin cambiar el contenido. mtime fijo, dueño 0, nombres ordenados, gzip nivel 9.
 */
function tarGz(files: [string, Buffer][]): Buffer {
  const blocks: Buffer[] = [];
  const octal = (n: number, len: number) => n.toString(8).padStart(len - 1, "0") + "\0";
  for (const [name, data] of files.sort(([a], [b]) => a.localeCompare(b))) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100);
    h.write(octal(0o644, 8), 100);
    h.write(octal(0, 8), 108);
    h.write(octal(0, 8), 116);
    h.write(octal(data.length, 12), 124);
    h.write(octal(946684800, 12), 136); // 2000-01-01
    h.write("        ", 148); // checksum en blanco mientras se calcula
    h.write("0", 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    const sum = [...h].reduce((a, b) => a + b, 0);
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 } as any);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Frontmatter YAML plano (clave: valor y un nivel de anidado para `metadata`). */
function frontmatter(md: string): Record<string, any> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, any> = {};
  let current: string | null = null;
  for (const line of m[1].split("\n")) {
    const nested = line.match(/^\s+([a-zA-Z-]+):\s*(.*)$/);
    const top = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (top) {
      current = top[1];
      out[current] = top[2] === "" ? {} : top[2].replace(/^"(.*)"$/, "$1");
    } else if (nested && current && typeof out[current] === "object") {
      out[current][nested[1]] = nested[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return out;
}

type Entry = { name: string; type: "skill-md" | "archive"; description: string; url: string; digest: string; version?: string };
const entries: Entry[] = [];
const legacy: { name: string; description: string; files: string[] }[] = [];

for (const name of readdirSync(ROOT).filter((n) => statSync(join(ROOT, n)).isDirectory()).sort()) {
  const dir = join(ROOT, name);
  const skillPath = join(dir, "SKILL.md");
  if (!existsSync(skillPath)) { problems.push(`${name}: sin SKILL.md`); continue; }
  const md = readFileSync(skillPath, "utf8");
  const fm = frontmatter(md);
  if (fm.name !== name) problems.push(`${name}: frontmatter name="${fm.name}" ≠ carpeta`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) problems.push(`${name}: nombre inválido (a-z, 0-9, guiones, ≤64)`);
  const desc = String(fm.description ?? "");
  if (!desc) problems.push(`${name}: sin description`);
  if (desc.length > 1024) problems.push(`${name}: description > 1024`);
  // Un `: ` dentro del valor hace que Claude descarte la skill en silencio (medido).
  if (/:\s/.test(desc)) problems.push(`${name}: description contiene ": " (Claude la descarta)`);
  if (md.split("\n").length > 500) problems.push(`${name}: SKILL.md pasa de 500 líneas`);
  if (!fm.metadata?.version) problems.push(`${name}: falta metadata.version`);
  if (String(fm.metadata?.internal) === "true") continue;

  const files = walk(dir).map((p) => relative(dir, p)).sort();
  legacy.push({ name, description: desc, files });

  let type: Entry["type"], url: string, bytes: Buffer;
  if (files.length === 1) {
    type = "skill-md";
    url = `${SITE}/skills/${name}/SKILL.md`;
    bytes = readFileSync(skillPath);
  } else {
    type = "archive";
    url = `${SITE}/skills/${name}.tar.gz`;
    bytes = tarGz(files.map((f) => [f, readFileSync(join(dir, f))]));
    if (write) writeFileSync(join(ROOT, `${name}.tar.gz`), bytes);
  }
  const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  entries.push({ name, type, description: desc, url, digest, version: fm.metadata?.version });
}

if (problems.length) {
  console.error("skills: " + problems.length + " problema(s)\n  - " + problems.join("\n  - "));
  process.exit(1);
}
if (write) {
  writeFileSync(join(ROOT, "index.json"), JSON.stringify({ $schema: SCHEMA, skills: entries }, null, 2) + "\n");
  writeFileSync(join(ROOT, "index.legacy.json"), JSON.stringify({ skills: legacy }, null, 2) + "\n");
}
console.log(`skills: ${entries.length} ok${write ? " (index.json + tar.gz escritos)" : ""}`);
