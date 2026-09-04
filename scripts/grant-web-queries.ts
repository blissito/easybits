/**
 * Regala consultas del toolset `web` (bonus, no caducan) a cuentas por correo.
 * Uso: npx tsx scripts/grant-web-queries.ts <consultas> <email> [email...]
 *   npx tsx scripts/grant-web-queries.ts 1000 alumno@x.com otro@y.com
 * Correos sin cuenta se reportan y se saltan: volver a correr cuando se registren.
 * Unidad = consulta (1 página leída, 1 búsqueda, 1 registro extraído).
 */
import "dotenv/config";
import { db } from "../app/.server/db";

(async () => {
  const [nArg, ...emails] = process.argv.slice(2);
  const n = Number(nArg);
  if (!n || !emails.length) { console.error("uso: <consultas> <email...>"); process.exit(1); }
  for (const email of emails) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true, webQueriesBonus: true } });
    if (!u) { console.log(`✗ ${email} — sin cuenta, pendiente`); continue; }
    const r = await db.user.update({ where: { id: u.id }, data: { webQueriesBonus: { increment: n } }, select: { webQueriesBonus: true } });
    db.aiGenerationLog.create({ data: { userId: u.id, type: "web_grant", product: "research", pageCount: n, source: "bonus" } }).catch(() => {});
    console.log(`✓ ${email} — +${n} → ${r.webQueriesBonus} consultas`);
  }
  process.exit(0);
})();
