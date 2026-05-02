/**
 * Re-sanitize landing.sections[].html across all docs to strip Tailwind JIT
 * arbitrary `bg-[#hex]`, `text-[#hex]`, `from-[#hex]` etc. that pre-deploy
 * generations leaked. Uses the SDK's theme-aware sanitizer with the doc's
 * resolved palette so hex values map to the correct semantic role.
 *
 * Usage:
 *   npx tsx scripts/repair-arbitrary-hex.ts            (dry run, lists offenders)
 *   npx tsx scripts/repair-arbitrary-hex.ts --apply    (writes sanitized HTML)
 *   npx tsx scripts/repair-arbitrary-hex.ts --doc <id> (limit to one doc)
 */
import { PrismaClient } from "@prisma/client";
import { sanitizeSemanticColors } from "../packages/html-tailwind-generator/src/sanitizeColors";
import { resolveLandingPaletteWithBrandKit } from "../app/.server/themePalette";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const docFlag = process.argv.indexOf("--doc");
const targetDoc = docFlag >= 0 ? process.argv[docFlag + 1] : null;
const verbose = process.argv.includes("--verbose");

const ARBITRARY_HEX = /(?<![A-Za-z0-9_-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|shadow|decoration|outline|divide|accent|placeholder)-\[#[0-9a-fA-F]{3,8}\](?:\/\d{1,3})?(?![A-Za-z0-9_-])/g;

type Section = { id: string; html?: string; order?: number; label?: string };

async function main() {
  console.log(`[repair-arbitrary-hex] mode: ${apply ? "APPLY" : "DRY RUN"}${targetDoc ? ` (doc=${targetDoc})` : ""}`);

  const where = targetDoc
    ? { id: targetDoc }
    : { sections: { not: undefined } };
  const landings = await db.landing.findMany({
    where,
    select: { id: true, name: true, theme: true, customColors: true, sections: true, metadata: true, ownerId: true, version: true },
  });

  console.log(`[repair-arbitrary-hex] scanning ${landings.length} landings`);

  let docsScanned = 0;
  let docsAffected = 0;
  let totalSectionsRewritten = 0;
  let totalArbitraryClassesFound = 0;
  let docsWritten = 0;

  for (const landing of landings) {
    docsScanned++;
    const sections = (landing.sections as unknown as Section[]) || [];
    if (sections.length === 0) continue;

    let docOffenderCount = 0;
    for (const s of sections) {
      const matches = (s.html || "").match(ARBITRARY_HEX);
      if (matches) docOffenderCount += matches.length;
    }
    if (docOffenderCount === 0) continue;

    docsAffected++;
    totalArbitraryClassesFound += docOffenderCount;

    // Resolve the palette so the sanitizer maps hex → semantic role correctly.
    const palette = await resolveLandingPaletteWithBrandKit(landing as any);

    const newSections = sections.map((s) => {
      if (!s.html) return s;
      const before = s.html;
      const after = sanitizeSemanticColors(before, palette);
      if (after !== before) {
        totalSectionsRewritten++;
        if (verbose) console.log(`  ✎ ${landing.id}/${s.id}: ${(before.match(ARBITRARY_HEX) || []).length} hits`);
      }
      return { ...s, html: after };
    });

    console.log(
      `→ ${landing.id} v${landing.version} "${(landing.name || "").slice(0, 40)}" — ` +
      `${docOffenderCount} arbitrary classes across ${sections.length} sections` +
      (palette ? ` (palette: ${Object.keys(palette).join(",")})` : " (no palette)")
    );

    if (apply) {
      await db.landing.update({
        where: { id: landing.id },
        data: { sections: newSections as any },
      });
      docsWritten++;
    }
  }

  console.log("");
  console.log(`Summary:`);
  console.log(`  scanned:                  ${docsScanned}`);
  console.log(`  docs with arbitrary hex:  ${docsAffected}`);
  console.log(`  arbitrary classes total:  ${totalArbitraryClassesFound}`);
  console.log(`  sections rewritten:       ${totalSectionsRewritten}`);
  if (apply) {
    console.log(`  DOCS WRITTEN:             ${docsWritten}`);
  } else {
    console.log(`  (dry run — re-run with --apply to write)`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
