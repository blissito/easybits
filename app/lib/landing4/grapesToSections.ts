import type { Section3 } from "~/lib/landing3/types";

/** Simple counter-based ID to keep stable across saves within a session */
let idCounter = 0;
function stableId() {
  return `s4_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

/**
 * Extract Section3[] from GrapesJS editor HTML (which may include a <style> block).
 * The <style> block with GrapesJS CSS is stored as a special first section.
 * Each top-level <section> or element becomes one Section3 entry.
 */
export function grapesToSections(html: string): Section3[] {
  if (!html || !html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Extract <style> tags (GrapesJS CSS) from head and body
  const styleTags = [
    ...Array.from(doc.head.querySelectorAll("style")),
    ...Array.from(doc.body.querySelectorAll("style")),
  ];
  const cssContent = styleTags.map((s) => s.textContent || "").join("\n").trim();
  // Remove style tags from body before processing elements
  doc.body.querySelectorAll("style").forEach((s) => s.remove());

  const children = Array.from(doc.body.children);
  const sections: Section3[] = [];

  // Store CSS as a special section if present
  if (cssContent) {
    sections.push({
      id: "__grapes_css__",
      order: -1,
      html: `<style>${cssContent}</style>`,
      label: "__css__",
    });
  }

  if (children.length === 0 && doc.body.innerHTML.trim()) {
    sections.push({
      id: stableId(),
      order: 0,
      html: `<section>${doc.body.innerHTML.trim()}</section>`,
      label: "Section 1",
    });
    return sections;
  }

  let order = 0;
  for (const el of children) {
    const id =
      el.getAttribute("data-section-id") || stableId();

    sections.push({
      id,
      order: order++,
      html: el.outerHTML,
      label:
        el.getAttribute("data-label") ||
        (el.tagName === "SECTION" ? `Section ${order}` : `Block ${order}`),
    });
  }

  return sections;
}
