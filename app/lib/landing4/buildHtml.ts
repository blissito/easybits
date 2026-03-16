import type { Section3 } from "~/lib/landing3/types";

/**
 * Build deploy HTML for Landings v4 (GrapesJS).
 * Includes Tailwind CDN + any GrapesJS-generated CSS from the __grapes_css__ section.
 */
export function buildDeployHtmlV4(
  sections: Section3[],
  opts?: { showBranding?: boolean; title?: string }
): string {
  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);

  // Extract raw CSS from the <style> wrapper
  let grapesCSS = "";
  if (cssSection) {
    const match = cssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    grapesCSS = match?.[1] || "";
  }

  const body = contentSections
    .map((s) => {
      return s.html
        .replace(/\s+contenteditable="[^"]*"/gi, "")
        .replace(/\s+data-section-id="[^"]*"/gi, "")
        .replace(/\s+data-label="[^"]*"/gi, "")
        .replace(/\s+data-gjs[^=]*="[^"]*"/gi, "");
    })
    .join("\n");

  const branding = opts?.showBranding !== false
    ? `<div style="text-align:center;padding:12px;font-size:11px;opacity:.5;font-family:system-ui">
        Built with <a href="https://easybits.cloud" target="_blank" style="color:inherit;text-decoration:underline">EasyBits</a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${opts?.title || "Landing Page"}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,sans-serif}
img{max-width:100%;height:auto}
${grapesCSS}
</style>
</head>
<body>
${body}
${branding}
</body>
</html>`;
}
