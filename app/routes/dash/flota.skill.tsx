/**
 * GET /dash/flota/skill/:fleetAgentId/:skillId — descarga un skill como .zip.
 *
 * ⚠️ Esto NO se puede hacer desde el navegador: los archivos viven en el bucket
 * público de Tigris, que responde 200 pero SIN `Access-Control-Allow-Origin`, así
 * que un `fetch` desde la página se bloquea por CORS y el ZIP sale vacío (falla en
 * silencio: el navegador no te deja ni ver el error). Desde el servidor no hay CORS.
 *
 * 🚨 Ruta de RECURSO: sin `export default`. Con un componente, React Router la trata
 * como documento y sirve el shell de la SPA con status 200 — ver la nota de
 * `robots.txt`/`sitemap.xml` en CLAUDE.md.
 */
import type { Route } from "./+types/flota.skill";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { fleetSkills } from "~/.server/core/fleetAgentOperations";
import { zipStore, type ZipEntry } from "~/lib/zip";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: params.fleetAgentId } });
  if (!fleetAgent || fleetAgent.ownerId !== user.id) {
    return new Response("not found", { status: 404 });
  }
  const skill = fleetSkills(fleetAgent).find((s) => s.id === params.skillId);
  if (!skill) return new Response("not found", { status: 404 });

  const slug = String(skill.name || "skill").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
  const files = skill.files?.length
    ? await db.file.findMany({ where: { id: { in: skill.files } }, select: { id: true, name: true, url: true } })
    : [];
  // Respeta el ORDEN del skill: files[0] es el SKILL.md (así lo guarda el alta).
  const byId = new Map(files.map((f) => [f.id, f]));
  const entries: ZipEntry[] = [];
  for (const id of skill.files ?? []) {
    const f = byId.get(id);
    if (!f?.url) continue;
    const res = await fetch(f.url).catch(() => null);
    if (!res?.ok) continue;
    entries.push({ path: `${slug}/${f.name}`, content: new Uint8Array(await res.arrayBuffer()) });
  }
  if (!entries.length) return new Response("skill sin archivos", { status: 404 });

  const zip = zipStore(entries);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
