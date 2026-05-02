import { PrismaClient } from "@prisma/client";
const docId = process.argv[2];
const pageId = process.argv[3];
if (!docId) process.exit(1);
const db = new PrismaClient();
(async () => {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) { console.log("not found"); process.exit(1); }
  const sections = (doc.sections as any[]) || [];
  for (const s of sections) {
    if (pageId && s.id !== pageId) continue;
    console.log(`\n=== section id=${s.id} order=${s.order} ===`);
    console.log(s.html);
  }
  await db.$disconnect();
})();
