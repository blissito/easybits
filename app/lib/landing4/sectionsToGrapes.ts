import type { Section3 } from "~/lib/landing3/types";

/** Tags that belong in <head> and are sometimes prepended per-page by importers. */
const HEAD_TAGS = new Set(["link", "meta", "style", "script", "title", "base"]);

/**
 * Find the first *content* root tag in an HTML fragment, skipping any leading
 * head-like elements (<link>, <style>, <meta>, etc.) that importers may have
 * prepended. Returns the positions of the opening tag so we can re-stamp
 * attributes on it cleanly.
 */
function findContentRootTag(
  html: string,
): { tagName: string; openTagStart: number; openTagEnd: number } | null {
  let pos = 0;
  while (pos < html.length) {
    // Skip whitespace + HTML comments
    while (pos < html.length && /\s/.test(html[pos])) pos++;
    if (html.startsWith("<!--", pos)) {
      const end = html.indexOf("-->", pos + 4);
      if (end === -1) return null;
      pos = end + 3;
      continue;
    }
    if (html[pos] !== "<") return null;
    const nameMatch = html.slice(pos).match(/^<(\w+)/);
    if (!nameMatch) return null;
    const tagName = nameMatch[1].toLowerCase();
    const openTagEnd = html.indexOf(">", pos);
    if (openTagEnd === -1) return null;

    if (!HEAD_TAGS.has(tagName)) {
      return { tagName: nameMatch[1], openTagStart: pos, openTagEnd };
    }

    // Void element (link/meta/base) — just advance past opening tag.
    if (tagName === "link" || tagName === "meta" || tagName === "base") {
      pos = openTagEnd + 1;
      continue;
    }
    // Element with content (style/script/title) — skip to closing tag.
    const closeIdx = html.toLowerCase().indexOf(`</${tagName}>`, openTagEnd);
    if (closeIdx === -1) return null;
    pos = closeIdx + tagName.length + 3;
  }
  return null;
}

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

  // Content sections — always inject data-section-id regardless of root tag.
  // Importers (splitIntoPages) may prepend head-extras like <link rel="stylesheet">
  // and <style> blocks to each page so stand-alone deploys keep fonts/styles.
  // Skip those when locating the *content* root tag, otherwise the attribute
  // lands on a <link> and GrapesJS loses it (the <section> stays untagged and
  // scrollToSection can't find it).
  for (const s of contentSections) {
    const html = s.html.trim();
    const loc = findContentRootTag(html);
    if (!loc) {
      parts.push(html);
      continue;
    }
    const { tagName, openTagStart, openTagEnd } = loc;
    const before = html.slice(0, openTagStart);
    const openTag = html
      .slice(openTagStart, openTagEnd + 1)
      .replace(/\s+data-section-id="[^"]*"/, "")
      .replace(/\s+data-label="[^"]*"/, "");
    const after = html.slice(openTagEnd + 1);
    const stamped = openTag.replace(
      new RegExp(`^<${tagName}`),
      `<${tagName} data-section-id="${s.id}" data-label="${s.label || ""}"`,
    );
    parts.push(before + stamped + after);
  }

  return parts.join("\n");
}
