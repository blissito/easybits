/**
 * Repair a doc's stored sections by re-running the import pipeline against
 * its original source HTML file (saved at import time under metadata.sourceFileId).
 *
 * Only rewrites `sections` + `metadata.customColors` + `metadata.intent`.
 * Keeps name, deploy state, format, sourceFileId untouched.
 *
 * Usage: npx tsx scripts/repair-doc-from-source.ts <documentId> [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { normalizeHexColors } from "../app/.server/mcp/importers/normalizeHexColors";
import { sanitizeSemanticColors } from "../app/.server/sanitizeColors";
import { getPlatformDefaultClient } from "../app/.server/storage";
import { JSDOM } from "jsdom";

const docId = process.argv[2];
const isDry = process.argv.includes("--dry");
if (!docId) {
  console.error("Usage: npx tsx scripts/repair-doc-from-source.ts <documentId> [--dry]");
  process.exit(1);
}

const db = new PrismaClient();

function detectIntent(format?: { width: number; height: number }): "social" | "presentation" | "document" {
  if (!format) return "document";
  const { width, height } = format;
  if (!width || !height) return "document";
  const r = width / height;
  if (r >= 0.95 && r <= 1.05) return "social";
  if (r >= 0.78 && r <= 0.82) return "social";
  if (r >= 0.55 && r <= 0.58) return "social";
  if (r >= 1.7 && r <= 1.85) return "presentation";
  if (r >= 1.3 && r <= 1.36) return "presentation";
  return "document";
}

// Mirror of splitIntoPages from app/.server/mcp/tools/importHtml.ts (minus format detection).
function splitPages(html: string): string[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const SELECTORS = [
    "[data-slide]",
    "[data-page]",
    "[data-page-number]",
    '[aria-roledescription="carousel"] > *',
    '[role="group"][aria-roledescription="slide"]',
    ".reveal .slides > section",
    ".carousel__slide",
    ".carousel-item",
    ".slide",
    ".page",
  ];
  let candidates: Element[] = [];
  for (const sel of SELECTORS) {
    const els = Array.from(doc.querySelectorAll(sel));
    if (els.length >= 2) { candidates = els; break; }
  }
  if (!candidates.length && doc.body) {
    const topLevel = Array.from(doc.body.children).filter(
      (el) => el.tagName === "SECTION" || el.tagName === "ARTICLE",
    );
    if (topLevel.length >= 2) candidates = topLevel;
  }
  if (candidates.length < 2) return [html];
  return candidates.map((el) => (el as HTMLElement).outerHTML);
}

async function main() {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) { console.error("not found"); process.exit(1); }
  const metadata = (doc.metadata as Record<string, unknown>) || {};
  const sourceFileId = metadata.sourceFileId as string | undefined;
  if (!sourceFileId) { console.error("No sourceFileId in metadata"); process.exit(1); }

  const file = await db.file.findUnique({ where: { id: sourceFileId } });
  if (!file) { console.error("Source file not found"); process.exit(1); }

  const client = getPlatformDefaultClient();
  const readUrl = await client.getReadUrl(file.storageKey);
  const resp = await fetch(readUrl);
  if (!resp.ok) { console.error("Failed to fetch source:", resp.status); process.exit(1); }
  const rawHtml = await resp.text();
  console.log(`Fetched source HTML: ${rawHtml.length} chars`);

  const rawPages = splitPages(rawHtml);
  console.log(`Split into ${rawPages.length} pages`);

  const roleMap: { surface?: string; onSurface?: string; primary?: string; accent?: string } = {};
  const processedPages = rawPages.map((pageHtml) => {
    const r = normalizeHexColors(pageHtml);
    for (const [role, hex] of Object.entries(r.roleMap) as Array<[keyof typeof roleMap, string | undefined]>) {
      if (hex && !roleMap[role]) roleMap[role] = hex;
    }
    return sanitizeSemanticColors(r.html);
  });

  const customColors: Record<string, string> | undefined = roleMap.primary ? {
    primary: roleMap.primary,
    secondary: roleMap.accent || roleMap.primary,
    ...(roleMap.accent ? { accent: roleMap.accent } : {}),
    ...(roleMap.surface ? { surface: roleMap.surface } : {}),
  } : undefined;

  const format = metadata.format as { width: number; height: number } | undefined;
  const intent = detectIntent(format);

  // Rebuild sections: keep __grapes_css__ if present, rebuild content
  const prevSections = (doc.sections as unknown as Array<{ id: string; order: number; html?: string; label?: string; type?: string }>) || [];
  const cssSection = prevSections.find((s) => s.id === "__grapes_css__");
  const newContent = processedPages.map((html, i) => ({
    id: nanoid(12),
    order: i,
    html,
    type: "imported",
    label: `Página ${i + 1}`,
  }));
  const newSections = cssSection ? [cssSection, ...newContent] : newContent;

  console.log("\n--- Summary ---");
  console.log(`Detected roleMap:`, roleMap);
  console.log(`New customColors:`, customColors);
  console.log(`Intent: ${intent}`);
  console.log(`Rebuilt ${newContent.length} content sections`);

  if (isDry) { console.log("\n[dry run] No DB write."); process.exit(0); }

  await db.landing.update({
    where: { id: docId },
    data: {
      sections: newSections as any,
      theme: customColors ? "custom" : (metadata.theme as string) || "default",
      metadata: {
        ...metadata,
        ...(customColors ? { customColors, theme: "custom" } : {}),
        intent,
      } as any,
    },
  });
  console.log("\n✓ Doc repaired. Hard reload the editor.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
