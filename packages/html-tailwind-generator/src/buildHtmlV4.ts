import type { Section3 } from "./types";
import { buildSingleThemeCss, buildCustomTheme } from "./themes";

/**
 * Build deploy HTML for Landings v4 (GrapesJS).
 * Includes Tailwind CDN + theme CSS variables + any GrapesJS-generated CSS.
 */
export function buildDeployHtmlV4(
  sections: Section3[],
  opts?: {
    showBranding?: boolean;
    title?: string;
    themeName?: string;
    customColors?: Record<string, string>;
  }
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

  // Build theme CSS variables
  let themeCss = "";
  if (opts?.customColors && Object.keys(opts.customColors).length) {
    let colors = opts.customColors;
    // Brand kit (only 4 colors) → derive full theme with on-* colors
    if (!colors["on-primary"] && colors.primary) {
      const full = buildCustomTheme(colors as any);
      colors = full.colors;
    }
    const vars = Object.entries(colors)
      .map(([k, v]) => `  --color-${k}: ${v};`)
      .join("\n");
    themeCss = `:root {\n${vars}\n}`;
  } else if (opts?.themeName && opts.themeName !== "custom") {
    try {
      themeCss = buildSingleThemeCss(opts.themeName).css || "";
    } catch { /* fallback: no theme */ }
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
<script>
tailwind.config={theme:{extend:{colors:{primary:'var(--color-primary)','primary-light':'var(--color-primary-light)','primary-dark':'var(--color-primary-dark)',secondary:'var(--color-secondary)',accent:'var(--color-accent)',surface:'var(--color-surface)','surface-alt':'var(--color-surface-alt)','on-primary':'var(--color-on-primary)','on-secondary':'var(--color-on-secondary)','on-accent':'var(--color-on-accent)','on-surface':'var(--color-on-surface)','on-surface-muted':'var(--color-on-surface-muted)'}}}}
<\/script>
<style>
${themeCss}
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
