/**
 * Post-process AI-generated HTML to replace hardcoded Tailwind color classes
 * (blue-*, indigo-*) with semantic color classes (bg-primary, text-primary, etc.).
 * Gray, white, and black are left intact as valid neutrals.
 */

const replacements: [RegExp, string][] = [
  // Background
  [/\bbg-(blue|indigo)-(500|600|700)\b/g, "bg-primary"],
  [/\bbg-(blue|indigo)-(50|100)\b/g, "bg-primary-light"],
  [/\bbg-(blue|indigo)-(800|900)\b/g, "bg-primary-dark"],
  [/\bbg-(blue|indigo)-(200|300|400)\b/g, "bg-primary"],

  // Text
  [/\btext-(blue|indigo)-(500|600|700)\b/g, "text-primary"],
  [/\btext-(blue|indigo)-(800|900)\b/g, "text-primary-dark"],
  [/\btext-(blue|indigo)-(50|100|200|300)\b/g, "text-on-primary"],
  [/\btext-(blue|indigo)-(400)\b/g, "text-primary"],

  // Border
  [/\bborder-(blue|indigo)-\d{2,3}\b/g, "border-primary"],

  // Ring
  [/\bring-(blue|indigo)-\d{2,3}\b/g, "ring-primary"],

  // Gradients
  [/\bfrom-(blue|indigo)-\d{2,3}\b/g, "from-primary"],
  [/\bto-(blue|indigo)-\d{2,3}\b/g, "to-primary"],
  [/\bvia-(blue|indigo)-\d{2,3}\b/g, "via-primary"],

  // Hover/focus variants
  [/\bhover:bg-(blue|indigo)-(500|600|700|800|900)\b/g, "hover:bg-primary-dark"],
  [/\bhover:bg-(blue|indigo)-(50|100|200|300|400)\b/g, "hover:bg-primary-light"],
  [/\bhover:text-(blue|indigo)-\d{2,3}\b/g, "hover:text-primary"],
  [/\bfocus:ring-(blue|indigo)-\d{2,3}\b/g, "focus:ring-primary"],
  [/\bfocus:border-(blue|indigo)-\d{2,3}\b/g, "focus:border-primary"],

  // Divide
  [/\bdivide-(blue|indigo)-\d{2,3}\b/g, "divide-primary"],

  // Placeholder
  [/\bplaceholder-(blue|indigo)-\d{2,3}\b/g, "placeholder-primary"],
];

export function sanitizeSemanticColors(html: string): string {
  let result = html;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
