// Lo que el CLI hace con un archivo de agente ANTES de mandarlo (sin red): qué secretos viajan,
// qué id trae y qué sube un directorio. Sin imports propios: el test lo carga directo con
// --experimental-strip-types. El plan vive en el servidor (app/.server/core/agentSpec.ts).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

type SkillFiles = Record<string, Array<{ path: string; contentBase64: string }>>;

/** Archivos bajo `root` (sin ocultos ni node_modules), en relativo con `/`. */
function walkLocal(root: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile()) out.push(relative(root, p).split("\\").join("/"));
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

/** Lo que el directorio trae para subir: skills/<slug>/… y files/…. */
export function readUploads(dir: string): { skills?: SkillFiles; files?: Record<string, string> } {
  const skills: SkillFiles = {};
  const skillsRoot = join(dir, "skills");
  if (existsSync(skillsRoot)) {
    for (const e of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      skills[e.name] = walkLocal(join(skillsRoot, e.name)).map((path) => ({ path, contentBase64: readFileSync(join(skillsRoot, e.name, path)).toString("base64") }));
    }
  }
  const filesRoot = join(dir, "files");
  const files = Object.fromEntries(walkLocal(filesRoot).map((p) => [p, readFileSync(join(filesRoot, p)).toString("base64")]));
  return { ...(Object.keys(skills).length ? { skills } : {}), ...(Object.keys(files).length ? { files } : {}) };
}

/** Los `${NOMBRE}` del archivo que existen en tu entorno: sólo esos viajan. */
export function secretsFor(text: string, env: NodeJS.ProcessEnv = process.env): { secrets: Record<string, string>; missing: string[] } {
  const names = [...new Set([...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]))];
  const secrets: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) env[n] !== undefined ? (secrets[n] = env[n]!) : missing.push(n);
  return { secrets, missing };
}

/** El id que trae el archivo (lo escribe el export). Sin parsear YAML: el CLI no tiene dependencias. */
export function specId(text: string): string | undefined {
  return /^id:\s*["']?([^"'\s#]+)/m.exec(text)?.[1] ?? /^\s{0,2}"id"\s*:\s*"([^"]+)"/m.exec(text)?.[1];
}

