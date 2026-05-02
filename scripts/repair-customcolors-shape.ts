/**
 * Repair customColors shape on landings created with the old applyBrandKit
 * (which saved { bg, surfaceAlt, accent, primary, text } instead of the
 * canonical { primary, secondary, accent, surface } that buildCustomTheme
 * expects). The runtime read path (resolveLandingPaletteWithBrandKit)
 * already normalizes legacy shapes — this migration backfills the data
 * at rest so future writes don't have to re-normalize.
 *
 * Usage:
 *   npx tsx scripts/repair-customcolors-shape.ts            (dry run)
 *   npx tsx scripts/repair-customcolors-shape.ts --apply    (write changes)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");

type LegacyColors = {
  bg?: string;
  surfaceAlt?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  surface?: string;
  text?: string;
  [k: string]: string | undefined;
};

function isLegacyShape(colors: Record<string, unknown>): boolean {
  // Legacy shape signal: has `bg` or `surfaceAlt` keys, AND missing canonical
  // `surface` (so it isn't a doc that already has both).
  const hasLegacy = "bg" in colors || "surfaceAlt" in colors;
  const missingCanonical = !("surface" in colors) || !("secondary" in colors);
  return hasLegacy && missingCanonical;
}

function normalize(colors: LegacyColors): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof colors.primary === "string") out.primary = colors.primary;
  if (typeof colors.accent === "string") out.accent = colors.accent;
  // Map legacy → canonical, preserve canonical if present.
  out.surface = (typeof colors.surface === "string" ? colors.surface : colors.bg) || "#ffffff";
  out.secondary =
    (typeof colors.secondary === "string" ? colors.secondary : colors.surfaceAlt) || colors.primary || "#71717a";
  return out;
}

async function main() {
  console.log(`[repair-customcolors-shape] mode: ${apply ? "APPLY" : "DRY RUN"}`);

  const landings = await db.landing.findMany({
    where: { theme: "custom" },
    select: { id: true, name: true, customColors: true, metadata: true, ownerId: true },
  });

  console.log(`[repair-customcolors-shape] found ${landings.length} landings with theme="custom"`);

  let candidates = 0;
  let unchanged = 0;
  let written = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const landing of landings) {
    const meta = (landing.metadata as Record<string, unknown> | null) || {};
    const fromTopLevel = landing.customColors as Record<string, unknown> | null;
    const fromMeta = meta.customColors as Record<string, unknown> | undefined;

    // Source of truth precedence: top-level customColors > metadata.customColors.
    const source = (fromTopLevel && typeof fromTopLevel === "object" && Object.keys(fromTopLevel).length > 0)
      ? fromTopLevel
      : fromMeta;

    if (!source) {
      skipped.push({ id: landing.id, reason: "no customColors anywhere" });
      continue;
    }

    if (!isLegacyShape(source)) {
      unchanged++;
      if (verbose) console.log(`  ✓ ${landing.id} — already canonical: ${JSON.stringify(source)}`);
      continue;
    }

    candidates++;
    const next = normalize(source as LegacyColors);
    console.log(
      `  → ${landing.id} ${landing.name?.slice(0, 40) || ""}\n` +
      `      legacy:  ${JSON.stringify(source)}\n` +
      `      canonical: ${JSON.stringify(next)}`
    );

    if (apply) {
      await db.landing.update({
        where: { id: landing.id },
        data: {
          customColors: next as any,
          metadata: { ...meta, customColors: next } as any,
        },
      });
      written++;
    }
  }

  console.log("");
  console.log(`Summary:`);
  console.log(`  total custom-theme landings: ${landings.length}`);
  console.log(`  already canonical:           ${unchanged}`);
  console.log(`  legacy shape (candidates):   ${candidates}`);
  console.log(`  skipped (no customColors):   ${skipped.length}`);
  if (apply) {
    console.log(`  WROTE:                       ${written}`);
  } else {
    console.log(`  (dry run — re-run with --apply to write)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
