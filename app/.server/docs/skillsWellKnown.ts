// /.well-known/skills/index.json y los archivos de cada skill (RFC 8615, el formato que lee
// `npx skills add https://easybits.cloud`). También sirve bajo /.well-known/agent-skills/*.
//
// Va por RUTA y no como estático porque `express.static` ignora los dotfiles: un
// `public/.well-known/` daría 404. Las skills viven en `public/skills/<name>/…` (así también
// se leen en el navegador); aquí sólo se indexan y se reexponen bajo el well-known.
const files = import.meta.glob("../../../public/skills/*/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type SkillEntry = { name: string; description: string; files: string[] };

const PREFIX = "../../../public/skills/";

export function skillsIndex(): SkillEntry[] {
  const byName = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const m = path.match(/\/public\/skills\/([a-z0-9-]+)\/(.+)$/);
    if (!m) continue;
    byName.set(m[1], [...(byName.get(m[1]) ?? []), m[2]]);
  }
  return [...byName.entries()]
    .filter(([, list]) => list.includes("SKILL.md"))
    .map(([name, list]) => {
      const md = files[`${PREFIX}${name}/SKILL.md`] ?? "";
      const description = md.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
      return { name, description, files: list.sort() };
    });
}

export function skillFile(name: string, path: string): string | undefined {
  return files[`${PREFIX}${name}/${path}`];
}
