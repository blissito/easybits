/**
 * Replace hardcoded Tailwind color classes with semantic color classes.
 *
 * Three layers:
 * 1. Neutral bg replacements: bg-white → bg-surface, bg-gray-900 → bg-primary-dark, etc.
 * 2. Chromatic replacements: bg-blue-500 → bg-secondary, bg-green-500 → bg-accent, etc.
 *    (only if the AI didn't already use semantic classes)
 * 3. Ancestor-aware text-color pass: walks the DOM with a stack of effective
 *    background family (primary | secondary | accent | surface) and rewrites
 *    every text-* that conflicts with its ancestor bg. This fixes "black-on-black"
 *    and "text-on-primary on bg-surface" invisible-text bugs regardless of theme.
 */

const COLORS =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const SECONDARY_COLORS = "blue|indigo|violet";
const ACCENT_COLORS = "green|emerald|teal|cyan";

function categorize(color: string): "primary" | "secondary" | "accent" {
  if (new RegExp(`^(?:${SECONDARY_COLORS})$`).test(color)) return "secondary";
  if (new RegExp(`^(?:${ACCENT_COLORS})$`).test(color)) return "accent";
  return "primary";
}

// ── Neutral bg replacements (text rewrites moved to ancestor-aware walker) ──
const NEUTRALS = "slate|gray|zinc|neutral|stone";

const neutralReplacements: [RegExp, string][] = [
  // bg-white → bg-surface
  [/\bbg-white\b/g, "bg-surface"],
  // bg-black → bg-primary-dark
  [/\bbg-black\b/g, "bg-primary-dark"],

  // bg-gray-50/100 → bg-surface
  [new RegExp(`\\bbg-(${NEUTRALS})-(50|100)\\b`, "g"), "bg-surface"],
  // bg-gray-200/300 → bg-surface-alt
  [new RegExp(`\\bbg-(${NEUTRALS})-(200|300)\\b`, "g"), "bg-surface-alt"],
  // bg-gray-400-600 → bg-primary
  [new RegExp(`\\bbg-(${NEUTRALS})-(400|500|600)\\b`, "g"), "bg-primary"],
  // bg-gray-700-950 → bg-primary-dark
  [new RegExp(`\\bbg-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "bg-primary-dark"],

  // hover:bg neutrals
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(50|100|200|300)\\b`, "g"), "hover:bg-surface-alt"],
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(400|500|600|700|800|900|950)\\b`, "g"), "hover:bg-primary-dark"],
];

// Hardcoded text colors get a SEEDED rewrite to text-on-surface (the default fallback).
// The ancestor-aware walker will then re-target them to the correct on-X variant.
const textSeedReplacements: [RegExp, string][] = [
  [/\btext-white\b/g, "text-on-surface-LIGHT"], // marker: "was light text"
  [/\btext-black\b/g, "text-on-surface-DARK"], // marker: "was dark text"
  [new RegExp(`\\btext-(${NEUTRALS})-(50|100|200)\\b`, "g"), "text-on-surface-LIGHT"],
  [new RegExp(`\\btext-(${NEUTRALS})-(300|400|500|600)\\b`, "g"), "text-on-surface-MUTED"],
  [new RegExp(`\\btext-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "text-on-surface-DARK"],
  [new RegExp(`\\bhover:text-(${NEUTRALS})-\\d{2,3}\\b`, "g"), "hover:text-on-surface"],
];

// ── Chromatic replacements ──
function buildChromaticReplacements(): [RegExp, (match: string, color: string) => string][] {
  const re = (prefix: string, shades: string) =>
    new RegExp(`\\b${prefix}-(${COLORS})-(${shades})\\b`, "g");

  return [
    // Background
    [re("bg", "500|600|700"), (_m, c) => `bg-${categorize(c)}`],
    [re("bg", "50|100"), (_m, c) => `bg-${categorize(c)}-light`],
    [re("bg", "800|900|950"), (_m, c) => `bg-${categorize(c)}-dark`],
    [re("bg", "200|300|400"), (_m, c) => `bg-${categorize(c)}`],

    // Text
    [re("text", "500|600|700"), (_m, c) => `text-${categorize(c)}`],
    [re("text", "800|900|950"), (_m, c) => `text-${categorize(c)}-dark`],
    [re("text", "50|100|200|300"), (_m, c) => `text-on-${categorize(c)}`],
    [re("text", "400"), (_m, c) => `text-${categorize(c)}`],

    // Border
    [re("border", "\\d{2,3}"), (_m, c) => `border-${categorize(c)}`],

    // Ring
    [re("ring", "\\d{2,3}"), (_m, c) => `ring-${categorize(c)}`],

    // Gradients
    [re("from", "\\d{2,3}"), (_m, c) => `from-${categorize(c)}`],
    [re("to", "\\d{2,3}"), (_m, c) => `to-${categorize(c)}`],
    [re("via", "\\d{2,3}"), (_m, c) => `via-${categorize(c)}`],

    // Hover/focus variants
    [new RegExp(`\\bhover:bg-(${COLORS})-(500|600|700|800|900|950)\\b`, "g"), (_m, c) => `hover:bg-${categorize(c)}-dark`],
    [new RegExp(`\\bhover:bg-(${COLORS})-(50|100|200|300|400)\\b`, "g"), (_m, c) => `hover:bg-${categorize(c)}-light`],
    [new RegExp(`\\bhover:text-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `hover:text-${categorize(c)}`],
    [new RegExp(`\\bfocus:ring-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `focus:ring-${categorize(c)}`],
    [new RegExp(`\\bfocus:border-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `focus:border-${categorize(c)}`],

    // Divide
    [re("divide", "\\d{2,3}"), (_m, c) => `divide-${categorize(c)}`],

    // Placeholder
    [re("placeholder", "\\d{2,3}"), (_m, c) => `placeholder-${categorize(c)}`],

    // Outline
    [re("outline", "\\d{2,3}"), (_m, c) => `outline-${categorize(c)}`],

    // Shadow colored
    [re("shadow", "\\d{2,3}"), (_m, c) => `shadow-${categorize(c)}`],

    // Decoration
    [re("decoration", "\\d{2,3}"), (_m, c) => `decoration-${categorize(c)}`],

    // Accent (form accent color)
    [re("accent", "\\d{2,3}"), (_m, c) => `accent-${categorize(c)}`],
  ];
}

const chromaticReplacements = buildChromaticReplacements();

// ==================== ANCESTOR-AWARE WALKER ====================

type BgFamily = "primary" | "secondary" | "accent" | "surface" | null;

const VOID_TAGS = new Set([
  "br", "hr", "img", "input", "meta", "link", "area", "base", "col",
  "embed", "source", "track", "wbr",
]);

/** Parse a class string and determine the effective bg family (ignoring state variants like hover:).
 *  Returns null for low-opacity tints (< 50%) — those are overlays that pass the ancestor bg through,
 *  so the text color should be decided against the real ancestor, not the tint.
 */
function detectBgFamily(classStr: string): BgFamily {
  const tokens = classStr.split(/\s+/).filter((c) => c && !c.includes(":"));
  // Last-wins: if an element has multiple bg classes, the rightmost one should reflect intent.
  let found: BgFamily = null;
  for (const t of tokens) {
    // Extract opacity suffix if present (e.g. "/10", "/50") and ignore anything below 50 —
    // those look through to the ancestor bg and should NOT be treated as a solid background.
    const opMatch = t.match(/\/(\d{1,3})$/);
    if (opMatch) {
      const op = parseInt(opMatch[1], 10);
      if (op < 50) continue;
    }
    if (/^bg-primary(?:-light|-dark)?(?:\/\d+)?$/.test(t)) found = "primary";
    else if (/^bg-secondary(?:\/\d+)?$/.test(t)) found = "secondary";
    else if (/^bg-accent(?:\/\d+)?$/.test(t)) found = "accent";
    else if (/^bg-surface(?:-alt)?(?:\/\d+)?$/.test(t)) found = "surface";
  }
  if (found) return found;
  // Gradient: infer from from-X stop (only when bg-gradient is present)
  if (tokens.some((t) => /^bg-gradient-/.test(t))) {
    for (const t of tokens) {
      const m = t.match(/^from-(primary|secondary|accent|surface)(?:-light|-dark|-alt)?(?:\/\d+)?$/);
      if (m) return m[1] as BgFamily;
    }
  }
  return null;
}

/** Walk the stack bottom-to-top to find the nearest defined bg family; default to surface. */
function effectiveBg(stack: BgFamily[]): Exclude<BgFamily, null> {
  for (let i = stack.length - 1; i >= 0; i--) {
    const v = stack[i];
    if (v !== null) return v;
  }
  return "surface";
}

function onClass(bg: Exclude<BgFamily, null>): string {
  return `text-on-${bg}`;
}

function onMutedClass(bg: Exclude<BgFamily, null>): string {
  return bg === "surface" ? "text-on-surface-muted" : `text-on-${bg}`;
}

/** Rewrite text-* classes inside a single element's class string based on its effective bg. */
function fixTextClassesForBg(classStr: string, bg: Exclude<BgFamily, null>): string {
  let s = classStr;
  const on = onClass(bg);
  const onMuted = onMutedClass(bg);

  // Seeded markers from pass 1 → resolve to correct on-X for this ancestor
  s = s.replace(/\btext-on-surface-LIGHT\b/g, on);
  s = s.replace(/\btext-on-surface-DARK\b/g, on);
  s = s.replace(/\btext-on-surface-MUTED\b/g, onMuted);

  // Re-target mis-assigned on-X classes (e.g. text-on-primary inside bg-surface)
  if (bg === "primary") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-primary");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-primary");
    s = s.replace(/\btext-on-accent\b/g, "text-on-primary");
    // text-primary on bg-primary is INVISIBLE (same hue) — rewrite to on-primary
    s = s.replace(/\btext-primary(?!-(?:light|dark))\b/g, "text-on-primary");
  } else if (bg === "secondary") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-secondary");
    s = s.replace(/\btext-on-primary\b/g, "text-on-secondary");
    s = s.replace(/\btext-on-accent\b/g, "text-on-secondary");
    s = s.replace(/\btext-secondary\b/g, "text-on-secondary");
  } else if (bg === "accent") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-accent");
    s = s.replace(/\btext-on-primary\b/g, "text-on-accent");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-accent");
    s = s.replace(/\btext-accent\b/g, "text-on-accent");
  } else {
    // bg === "surface" — text-on-primary/secondary/accent likely invisible on surface
    s = s.replace(/\btext-on-primary\b/g, "text-on-surface");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-surface");
    s = s.replace(/\btext-on-accent\b/g, "text-on-surface");
  }

  return s;
}

/** Ancestor-aware pass: walk HTML, maintain bg stack, rewrite text-* per element. */
function ancestorAwareTextPass(html: string): string {
  try {
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;
    const stack: BgFamily[] = [];
    let out = "";
    let lastIdx = 0;
    let m: RegExpExecArray | null;

    while ((m = tagRe.exec(html)) !== null) {
      const [full, slash, tagName, attrs, selfCloseSlash] = m;
      out += html.slice(lastIdx, m.index);
      lastIdx = m.index + full.length;

      if (slash === "/") {
        // Closing tag
        stack.pop();
        out += full;
        continue;
      }

      // Opening (or self-closing) tag
      const classMatch = attrs.match(/\bclass="([^"]*)"/);
      const ownBg = classMatch ? detectBgFamily(classMatch[1]) : null;
      const effective: Exclude<BgFamily, null> = ownBg ?? effectiveBg(stack);

      let newAttrs = attrs;
      if (classMatch) {
        const fixed = fixTextClassesForBg(classMatch[1], effective);
        if (fixed !== classMatch[1]) {
          newAttrs = attrs.replace(/\bclass="[^"]*"/, `class="${fixed}"`);
        }
      }
      out += `<${tagName}${newAttrs}${selfCloseSlash}>`;

      const isVoid = VOID_TAGS.has(tagName.toLowerCase()) || selfCloseSlash === "/";
      if (!isVoid) stack.push(ownBg);
    }
    out += html.slice(lastIdx);

    // Clean up any remaining markers that slipped through (e.g. in malformed fragments)
    out = out
      .replace(/\btext-on-surface-LIGHT\b/g, "text-on-surface")
      .replace(/\btext-on-surface-DARK\b/g, "text-on-surface")
      .replace(/\btext-on-surface-MUTED\b/g, "text-on-surface-muted");

    return out;
  } catch {
    // Defensive: if tokenizer trips on weird HTML, return input with markers stripped.
    return html
      .replace(/\btext-on-surface-LIGHT\b/g, "text-on-surface")
      .replace(/\btext-on-surface-DARK\b/g, "text-on-surface")
      .replace(/\btext-on-surface-MUTED\b/g, "text-on-surface-muted");
  }
}

export function sanitizeSemanticColors(html: string): string {
  let result = html;

  // 1. Replace neutral bg classes (bg-white, bg-gray-*, etc.)
  for (const [pattern, replacement] of neutralReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 2. Seed hardcoded text colors with markers that the walker will resolve per ancestor.
  for (const [pattern, replacement] of textSeedReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 3. Skip chromatic sanitization if the AI already used semantic classes.
  const hasSemanticClasses = /\b(?:bg-primary|bg-secondary|bg-accent|bg-surface)\b/.test(result);
  if (!hasSemanticClasses) {
    for (const [pattern, replacer] of chromaticReplacements) {
      result = result.replace(pattern, replacer as any);
    }
  }

  // 4. Ancestor-aware pass: resolve seed markers and fix mis-matched text-on-X classes.
  result = ancestorAwareTextPass(result);

  return result;
}
