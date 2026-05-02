import { PrismaClient } from "@prisma/client";
import { sanitizeSemanticColors } from "../packages/html-tailwind-generator/src/sanitizeColors";
import { resolveLandingPaletteWithBrandKit } from "../app/.server/themePalette";

const db = new PrismaClient();
const docId = process.argv[2];
if (!docId) { console.error("usage: tsx preview-hex-rewrite.ts <docId>"); process.exit(1); }

async function main() {
  const landing = await db.landing.findUnique({ where: { id: docId } });
  if (!landing) { console.error("not found"); process.exit(1); }
  const palette = await resolveLandingPaletteWithBrandKit(landing as any);
  console.log(`palette: ${JSON.stringify(palette)}`);
  console.log("");

  const sections = (landing.sections as any) as { id: string; html?: string }[];
  for (const s of sections) {
    const before = s.html || "";
    const after = sanitizeSemanticColors(before, palette);
    if (before === after) continue;
    const beforeHits = before.match(/(?:bg|text|border|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\](?:\/\d+)?/g) || [];
    const afterHits = after.match(/(?:bg|text|border|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\](?:\/\d+)?/g) || [];
    console.log(`[${s.id}] before=${beforeHits.length} hits, after=${afterHits.length} hits`);
    // Show first few rewrites
    const beforeUniq = [...new Set(beforeHits)].slice(0, 8);
    for (const h of beforeUniq) {
      const role = sanitizeSemanticColors(h, palette);
      console.log(`  ${h.padEnd(28)} → ${role}`);
    }
    console.log("");
  }
}
main().finally(() => db.$disconnect());
