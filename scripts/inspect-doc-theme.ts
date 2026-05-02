import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: tsx inspect-doc-theme.ts <docId> [docId...]");
  process.exit(1);
}

async function main() {
  for (const id of ids) {
    const d = await db.landing.findUnique({
      where: { id },
      select: { id: true, name: true, theme: true, customColors: true, metadata: true, version: true, updatedAt: true },
    });
    if (!d) { console.log(`${id} — NOT FOUND`); continue; }
    const meta = (d.metadata as Record<string, unknown> | null) || {};
    console.log(`${d.id} v${d.version} "${d.name}"`);
    console.log(`  theme: ${d.theme}`);
    console.log(`  customColors (top): ${JSON.stringify(d.customColors)}`);
    console.log(`  customColors (meta): ${JSON.stringify(meta.customColors)}`);
    console.log(`  brandKitId: ${meta.brandKitId || "(none)"}`);
    console.log(`  format: ${JSON.stringify(meta.format)}`);
    console.log(`  updatedAt: ${d.updatedAt.toISOString()}`);
    console.log("");
  }
}
main().finally(() => db.$disconnect());
