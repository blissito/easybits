import type { Section3 } from "~/lib/landing3/types";

/**
 * Convert Section3[] to a single HTML string for loading into GrapesJS.
 * Each section gets a data-section-id attribute for round-trip mapping.
 * Special __grapes_css__ section is prepended as <style>.
 */
export function sectionsToHtml(sections: Section3[]): string {
  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);

  const parts: string[] = [];

  // CSS block
  if (cssSection) {
    parts.push(cssSection.html);
  }

  // Content sections
  for (const s of contentSections) {
    const html = s.html.trim();
    if (html.startsWith("<section")) {
      parts.push(
        html.replace(
          /^<section/,
          `<section data-section-id="${s.id}" data-label="${s.label || ""}"`
        )
      );
    } else {
      parts.push(html);
    }
  }

  return parts.join("\n");
}
