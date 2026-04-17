/**
 * Refine a migrated template: for a subset of style properties (the ones
 * that get a full-bleed color fill), swap the token "primary" to the darker
 * variant "primary-dark" so the visual weight feels similar regardless of
 * whether the kit's primary is already dark or light.
 *
 * Context-aware — only looks at style object keys.
 *
 * Usage: npx tsx scripts/refine-template-brand-tokens.ts <templateId>
 */
import { db } from "../app/.server/db";

// Style keys that render a full color "field" on screen: swap primary → primary-dark
// so the header/sidebar doesn't scream when the kit's primary is a bright hue.
const DARKEN_KEYS = new Set([
  "backgroundColor",
  "borderLeftColor",
  "borderRightColor",
  "borderTopColor",
  "borderBottomColor",
  "borderColor",
]);

type StylePatch = { key: string; from: string; to: string };
const patches: StylePatch[] = [];

function refineStyle(style: any): any {
  if (!style || typeof style !== "object" || Array.isArray(style)) return style;
  const out: any = { ...style };
  for (const [k, v] of Object.entries(style)) {
    if (v === "primary" && DARKEN_KEYS.has(k)) {
      out[k] = "primary-dark";
      patches.push({ key: k, from: "primary", to: "primary-dark" });
    }
  }
  return out;
}

function refineNode(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(refineNode);
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "style") out[k] = refineStyle(v);
    else if (Array.isArray(v)) out[k] = v.map(refineNode);
    else if (v && typeof v === "object") out[k] = refineNode(v);
    else out[k] = v;
  }
  return out;
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: refine-template-brand-tokens.ts <templateId>");
    process.exit(1);
  }
  const t = await db.mcpTemplate.findUnique({ where: { id } });
  if (!t) {
    console.error(`Template ${id} not found`);
    process.exit(1);
  }

  const refined = refineNode(t.tree);
  if (patches.length === 0) {
    console.log("No changes — no primary-in-background references found.");
    process.exit(0);
  }

  console.log(`Refining template "${t.name}" (${t.id})\n`);
  const byKey: Record<string, number> = {};
  for (const p of patches) byKey[p.key] = (byKey[p.key] ?? 0) + 1;
  for (const [k, count] of Object.entries(byKey)) {
    console.log(`  ${k}: primary → primary-dark  (x${count})`);
  }
  console.log();

  await db.mcpTemplate.update({
    where: { id: t.id },
    data: { tree: refined as any },
  });

  console.log("Template refined. Primary now only appears on text/decorative lines; backgrounds use primary-dark.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
