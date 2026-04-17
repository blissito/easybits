/**
 * Migrate hardcoded brand colors in a structured_doc template tree to
 * semantic tokens so it responds to the user's brand kit.
 *
 * Only swaps specific hex values we identified by reading the template; leaves
 * neutrals (whites, grays, borders) alone on purpose so the change is safe
 * for kits with any surface color.
 *
 * Usage: npx tsx scripts/migrate-template-to-brand-tokens.ts <templateId>
 */
import { db } from "../app/.server/db";

// Case-insensitive hex → semantic token. Every value must be either a real
// token from the renderer's COLOR_TOKENS set, or the string "KEEP" meaning
// "leave the original hex untouched" (used for documentation only).
const COLOR_MAP: Record<string, string> = {
  // Navy brand (header bg, left borders) → primary
  "#1A2B4A": "primary",
  // Blue accents (headline flavor text, "total" emphasis, email links) → accent
  "#7EB3FF": "accent",
  "#2E6AE6": "accent",
  // Light tile bg (cards, info boxes) → surface-alt
  "#F7F9FC": "surface-alt",
};

function transform(value: unknown): unknown {
  if (typeof value === "string") {
    const token = COLOR_MAP[value.toUpperCase()];
    return token ?? value;
  }
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = transform(v);
    return out;
  }
  return value;
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: migrate-template-to-brand-tokens.ts <templateId>");
    process.exit(1);
  }
  const t = await db.mcpTemplate.findUnique({ where: { id } });
  if (!t) {
    console.error(`Template ${id} not found`);
    process.exit(1);
  }

  const before = JSON.stringify(t.tree);
  const migrated = transform(t.tree);
  const after = JSON.stringify(migrated);

  if (before === after) {
    console.log("No changes needed — no mapped hex values found.");
    process.exit(0);
  }

  // Count swaps per color so we can report what happened.
  const counts: Record<string, number> = {};
  for (const hex of Object.keys(COLOR_MAP)) {
    const re = new RegExp(hex, "gi");
    const found = before.match(re);
    if (found) counts[hex] = found.length;
  }

  console.log(`Migrating template "${t.name}" (${t.id})\n`);
  console.log("Replacements:");
  for (const [hex, count] of Object.entries(counts)) {
    console.log(`  ${hex} -> ${COLOR_MAP[hex]}  (x${count})`);
  }
  console.log();

  await db.mcpTemplate.update({
    where: { id: t.id },
    data: { tree: migrated as any },
  });

  console.log("Template updated. Next time you create a doc from it, the brand kit applies.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
