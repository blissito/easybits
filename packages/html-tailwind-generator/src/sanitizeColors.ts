/**
 * Replace hardcoded Tailwind color classes with semantic color classes.
 *
 * Two layers:
 * 1. Neutral colors: bg-white → bg-surface, text-black → text-on-surface, bg-gray-* → semantic
 * 2. Chromatic colors: bg-blue-500 → bg-secondary, bg-green-500 → bg-accent, etc.
 *
 * Maps chromatic colors by family:
 * - Blues/indigos/violet → secondary
 * - Greens/teals/emerald/cyan → accent
 * - Everything else → primary
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

// ── Neutral replacements (bg-white, text-black, bg-gray-*, text-gray-*, etc.) ──
const NEUTRALS = "slate|gray|zinc|neutral|stone";

const neutralReplacements: [RegExp, string][] = [
  // bg-white → bg-surface
  [/\bbg-white\b/g, "bg-surface"],
  // bg-black → bg-primary-dark
  [/\bbg-black\b/g, "bg-primary-dark"],
  // text-white → text-on-primary
  [/\btext-white\b/g, "text-on-primary"],
  // text-black → text-on-surface
  [/\btext-black\b/g, "text-on-surface"],

  // bg-gray-50/100 → bg-surface
  [new RegExp(`\\bbg-(${NEUTRALS})-(50|100)\\b`, "g"), "bg-surface"],
  // bg-gray-200/300 → bg-surface-alt
  [new RegExp(`\\bbg-(${NEUTRALS})-(200|300)\\b`, "g"), "bg-surface-alt"],
  // bg-gray-400-600 → bg-primary
  [new RegExp(`\\bbg-(${NEUTRALS})-(400|500|600)\\b`, "g"), "bg-primary"],
  // bg-gray-700-950 → bg-primary-dark
  [new RegExp(`\\bbg-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "bg-primary-dark"],

  // text-gray-300/400 → text-on-surface-muted
  [new RegExp(`\\btext-(${NEUTRALS})-(300|400)\\b`, "g"), "text-on-surface-muted"],
  // text-gray-500/600 → text-on-surface-muted
  [new RegExp(`\\btext-(${NEUTRALS})-(500|600)\\b`, "g"), "text-on-surface-muted"],
  // text-gray-700/800/900 → text-on-surface
  [new RegExp(`\\btext-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "text-on-surface"],
  // text-gray-50/100/200 → text-on-primary
  [new RegExp(`\\btext-(${NEUTRALS})-(50|100|200)\\b`, "g"), "text-on-primary"],

  // hover:bg-gray → hover semantic
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(50|100|200|300)\\b`, "g"), "hover:bg-surface-alt"],
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(400|500|600|700|800|900|950)\\b`, "g"), "hover:bg-primary-dark"],

  // hover:text neutrals
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

export function sanitizeSemanticColors(html: string): string {
  let result = html;

  // 1. Replace neutral colors (bg-white, text-black, bg-gray-*, etc.)
  for (const [pattern, replacement] of neutralReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 2. Skip chromatic sanitization if the AI already used semantic classes.
  //    If bg-primary/bg-secondary/bg-accent/bg-surface appear, the AI followed
  //    instructions and we should NOT rewrite its color choices.
  const hasSemanticClasses = /\b(?:bg-primary|bg-secondary|bg-accent|bg-surface)\b/.test(result);
  if (!hasSemanticClasses) {
    // AI ignored semantic instructions — apply chromatic replacements as safety net
    for (const [pattern, replacer] of chromaticReplacements) {
      result = result.replace(pattern, replacer as any);
    }
  }

  return result;
}
