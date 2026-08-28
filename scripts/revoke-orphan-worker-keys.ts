/**
 * Revoca las API keys que los workers de flota minteaban en cada spawn
 * (claude-worker-, codex-worker-, ghosty-gc-) y nunca se revocaban.
 * Conserva las de los últimos N días (una VM viva/dormida puede tenerla en su env).
 *   npx tsx scripts/revoke-orphan-worker-keys.ts [dias=2] [--apply]
 */
import { db } from "~/.server/db";
(async () => {
  const days = Number(process.argv[2]) || 2;
  const apply = process.argv.includes("--apply");
  const where = {
    status: "ACTIVE" as const,
    OR: [{ name: { startsWith: "claude-worker-" } }, { name: { startsWith: "codex-worker-" } }, { name: { startsWith: "ghosty-gc-" } }],
    createdAt: { lt: new Date(Date.now() - days * 864e5) },
  };
  const n = await db.apiKey.count({ where });
  console.log(`${n} keys huérfanas de worker con más de ${days} días`);
  if (!apply) { console.log("dry-run; añade --apply para revocar"); process.exit(0); }
  const r = await db.apiKey.updateMany({ where, data: { status: "REVOKED", revokedAt: new Date() } });
  console.log(`revocadas: ${r.count}`);
  process.exit(0);
})();
