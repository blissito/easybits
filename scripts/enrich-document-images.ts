/**
 * Script to enrich placeholder images in a document with real Pexels photos.
 *
 * Usage: npx tsx scripts/enrich-document-images.ts <documentId>
 *
 * Requires PEXELS_API_KEY and DATABASE_URL env vars.
 */
import { PrismaClient } from "@prisma/client";
import {
  enrichImages,
  findImageSlots,
} from "@easybits.cloud/html-tailwind-generator/images";

const docId = process.argv[2];
if (!docId) {
  console.error("Usage: npx tsx scripts/enrich-document-images.ts <documentId>");
  process.exit(1);
}

const pexelsKey = process.env.PEXELS_API_KEY;
if (!pexelsKey) {
  console.error("PEXELS_API_KEY env var required");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) {
    console.error(`Document ${docId} not found`);
    process.exit(1);
  }

  const sections = (doc.sections || []) as Array<{
    id: string;
    order: number;
    html?: string;
    type?: string;
    name?: string;
  }>;

  console.log(`Document: ${doc.name} (${sections.length} pages)`);

  let updated = 0;
  for (const section of sections) {
    if (!section.html) continue;
    // Normalize single quotes to double quotes on img tags so findImageSlots regex matches
    section.html = section.html.replace(
      /<img\s[^>]*>/gi,
      (tag) => tag.replace(/='/g, '="').replace(/' /g, '" ').replace(/'\/>/g, '"/>')
        .replace(/'>/g, '">')
    );
    const slots = findImageSlots(section.html);
    if (slots.length === 0) continue;

    console.log(`  Page ${section.order} (${section.id}): ${slots.length} image slots`);
    const enriched = await enrichImages(section.html, pexelsKey);
    if (enriched !== section.html) {
      section.html = enriched;
      updated++;
      console.log(`    ✓ enriched`);
    } else {
      console.log(`    - no changes`);
    }
  }

  if (updated > 0) {
    await db.landing.update({
      where: { id: docId },
      data: { sections: sections as any },
    });
    console.log(`\nUpdated ${updated} pages.`);
  } else {
    console.log("\nNo pages needed enrichment.");
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
