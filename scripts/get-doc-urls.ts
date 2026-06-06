import { PrismaClient } from "@prisma/client";
const docId = process.argv[2];
const db = new PrismaClient();
(async () => {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) { console.log("not found"); process.exit(1); }
  console.log({
    id: doc.id,
    name: doc.name,
    status: doc.status,
    websiteId: doc.websiteId,
    updatedAt: doc.updatedAt,
  });
  if (doc.websiteId) {
    const w = await db.website.findUnique({ where: { id: doc.websiteId } });
    console.log("website:", w ? { id: w.id, slug: w.slug, status: w.status, updatedAt: w.updatedAt } : "missing");
  }
  await db.$disconnect();
})();
