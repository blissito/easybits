/**
 * Replace hardcoded Tailwind color classes with semantic color classes
 * (bg-primary, text-primary, etc.). Gray/white/black/slate/zinc/neutral stay intact.
 *
 * Covers ALL chromatic Tailwind colors the model might generate.
 */

// All chromatic colors Tailwind ships (excluding neutrals: slate, gray, zinc, neutral, stone)
const COLORS =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

function re(prefix: string, shades: string): RegExp {
  return new RegExp(`\\b${prefix}-(${COLORS})-(${shades})\\b`, "g");
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

export function sanitizeSemanticColors(html: string): string {
  let result = html;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
