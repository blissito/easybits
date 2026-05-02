/**
 * Replace hardcoded Tailwind color classes with semantic color classes
 * (bg-primary, text-primary, etc.). Gray/white/black/slate/zinc/neutral stay intact.
 *
 * Covers ALL chromatic Tailwind colors the model might generate, plus Tailwind
 * JIT arbitrary values like bg-[#9a99ea] that would otherwise bypass the
 * semantic token system.
 *
 * Keep in sync with packages/html-tailwind-generator/src/sanitizeColors.ts.
 * That copy is more sophisticated (ancestor-aware walker, theme-palette nearest
 * matching). This copy is the post-processing safety net for content that did
 * NOT flow through the SDK (manual MCP set_page_html, inject_html, repair scripts).
 */

// All chromatic colors Tailwind ships (excluding neutrals: slate, gray, zinc, neutral, stone)
const COLORS =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

function re(prefix: string, shades: string): RegExp {
  return new RegExp(`\\b${prefix}-(${COLORS})-(${shades})\\b`, "g");
}

// Tailwind JIT arbitrary chromatic values — strip and remap to semantic role.
// When themeColors is provided, the role is chosen by RGB distance against the
// active palette (so #9a99ea → primary if that's the user's primary). Without
// a palette, falls back to a coarse default (bg-like → primary, text → on-surface).
const BG_LIKE_UTILS = "bg|border|ring|from|to|via|shadow|decoration|outline|divide|accent|placeholder";

const BG_ARBITRARY_RE = new RegExp(
  `(?<![A-Za-z0-9_-])((?:[a-z-]+:)*)(${BG_LIKE_UTILS})-\\[#([0-9a-fA-F]{3,8})\\](\\/\\d{1,3})?(?![A-Za-z0-9_-])`,
  "g"
);
const TEXT_ARBITRARY_RE = /(?<![A-Za-z0-9_-])((?:[a-z-]+:)*)text-\[#([0-9a-fA-F]{3,8})\](\/\d{1,3})?(?![A-Za-z0-9_-])/g;

type Rgb = { r: number; g: number; b: number };

function parseHexLocal(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function nearestRole(hex: string, themeColors: Record<string, string>): string | null {
  const target = parseHexLocal(hex);
  if (!target) return null;
  const roles = ["primary", "secondary", "accent", "surface"];
  let best: string | null = null;
  let bestDist = Infinity;
  for (const role of roles) {
    const v = themeColors[role];
    const rgb = v ? parseHexLocal(v) : null;
    if (!rgb) continue;
    const d = (target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2;
    if (d < bestDist) { bestDist = d; best = role; }
  }
  return best;
}

const replacements: [RegExp, string][] = [
  // Background
  [re("bg", "500|600|700"), "bg-primary"],
  [re("bg", "50|100"), "bg-primary-light"],
  [re("bg", "800|900|950"), "bg-primary-dark"],
  [re("bg", "200|300|400"), "bg-primary"],

  // Text
  [re("text", "500|600|700"), "text-primary"],
  [re("text", "800|900|950"), "text-primary-dark"],
  [re("text", "50|100|200|300"), "text-on-primary"],
  [re("text", "400"), "text-primary"],

  // Border
  [re("border", "\\d{2,3}"), "border-primary"],

  // Ring
  [re("ring", "\\d{2,3}"), "ring-primary"],

  // Gradients
  [re("from", "\\d{2,3}"), "from-primary"],
  [re("to", "\\d{2,3}"), "to-primary"],
  [re("via", "\\d{2,3}"), "via-primary"],

  // Hover/focus variants
  [new RegExp(`\\bhover:bg-(${COLORS})-(500|600|700|800|900|950)\\b`, "g"), "hover:bg-primary-dark"],
  [new RegExp(`\\bhover:bg-(${COLORS})-(50|100|200|300|400)\\b`, "g"), "hover:bg-primary-light"],
  [new RegExp(`\\bhover:text-(${COLORS})-\\d{2,3}\\b`, "g"), "hover:text-primary"],
  [new RegExp(`\\bfocus:ring-(${COLORS})-\\d{2,3}\\b`, "g"), "focus:ring-primary"],
  [new RegExp(`\\bfocus:border-(${COLORS})-\\d{2,3}\\b`, "g"), "focus:border-primary"],

  // Divide
  [re("divide", "\\d{2,3}"), "divide-primary"],

  // Placeholder
  [re("placeholder", "\\d{2,3}"), "placeholder-primary"],

  // Outline
  [re("outline", "\\d{2,3}"), "outline-primary"],

  // Shadow colored
  [re("shadow", "\\d{2,3}"), "shadow-primary"],

  // Decoration
  [re("decoration", "\\d{2,3}"), "decoration-primary"],

  // Accent
  [re("accent", "\\d{2,3}"), "accent-primary"],
];

export function sanitizeSemanticColors(
  html: string,
  themeColors?: Record<string, string>
): string {
  let result = html;

  // 1. Strip Tailwind JIT arbitrary values — bg-[#hex], text-[#hex], etc.
  result = result.replace(BG_ARBITRARY_RE, (_m, variants: string, util: string, hex: string, opacity: string | undefined) => {
    const role = (themeColors && nearestRole(hex, themeColors)) || "primary";
    return `${variants}${util}-${role}${opacity || ""}`;
  });
  result = result.replace(TEXT_ARBITRARY_RE, (_m, variants: string, _hex: string, opacity: string | undefined) => {
    // Without an ancestor walker here, default to text-on-surface; opacity preserved.
    return `${variants}text-on-surface${opacity || ""}`;
  });

  // 2. Replace numbered Tailwind palette classes (bg-blue-500 → bg-primary, etc.)
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
