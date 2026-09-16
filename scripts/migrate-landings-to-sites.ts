// Migración one-shot (2026-09-16): cada Landing PUBLICADA (con websiteId) pasa a
// aparecer en /dash/sitios como Site{kind:"static"}. No borra nada: la fila Landing
// y el Website quedan; solo se crea el puntero. Idempotente por websiteId.
//   npx tsx scripts/migrate-landings-to-sites.ts [--dry]
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const dry = process.argv.includes("--dry");
// version 4 = Documentos (producto aparte, sigue en /dash/documents): NO se migra.
const landings = await db.landing.findMany({
  where: { websiteId: { isSet: true }, version: { not: 4 } },
  select: { id: true, ownerId: true, name: true, websiteId: true, version: true },
});
const existing = new Set((await db.site.findMany({ where: { websiteId: { isSet: true } }, select: { websiteId: true } })).map((s) => s.websiteId));
let created = 0;
for (const l of landings) {
  if (!l.websiteId || existing.has(l.websiteId)) continue;
  const w = await db.website.findUnique({ where: { id: l.websiteId }, select: { status: true } });
  if (!w || w.status === "DELETED") continue;
  console.log(`${dry ? "[dry] " : ""}Site ← Landing v${l.version} "${l.name}" (${l.id}) website ${l.websiteId}`);
  if (!dry) await db.site.create({ data: { ownerId: l.ownerId, kind: "static", name: l.name || "Sitio", websiteId: l.websiteId } });
  created++;
}
console.log(`${created} sitios ${dry ? "por crear" : "creados"} de ${landings.length} landings publicadas`);
await db.$disconnect();
