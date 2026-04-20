import { PrismaClient } from "@prisma/client";
const docId = process.argv[2];
if (!docId) process.exit(1);
const db = new PrismaClient();
(async () => {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) { console.log("not found"); process.exit(1); }
  const sections = (doc.sections as any[]) || [];
  console.log(`name: ${doc.name}`);
  console.log(`sections: ${sections.length}`);
  console.log(`metadata.format: ${JSON.stringify((doc.metadata as any)?.format)}`);
  console.log(`metadata.intent: ${(doc.metadata as any)?.intent}`);
  console.log(`metadata.customColors: ${JSON.stringify((doc.metadata as any)?.customColors)}`);
  for (const s of sections) {
    console.log(`\n--- section id=${s.id} order=${s.order} label=${s.label}`);
    console.log(`html[0..400]: ${(s.html || "").slice(0, 400)}`);
  }
  await db.$disconnect();
})();
