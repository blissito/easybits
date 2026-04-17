import { db } from "../app/.server/db";
async function main() {
  const id = process.argv[2];
  if (!id) { console.error("usage: dump-template.ts <id>"); process.exit(1); }
  const t = await db.mcpTemplate.findUnique({ where: { id } });
  if (!t) { console.error("not found"); process.exit(1); }
  console.log(JSON.stringify(t.tree, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
