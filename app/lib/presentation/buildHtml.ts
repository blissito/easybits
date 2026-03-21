import type { Section3 } from "~/lib/landing3/types";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";

const REVEAL_CDN = "https://cdn.jsdelivr.net/npm/reveal.js@5.1.0";

/**
 * Build deploy HTML for presentations v2 (GrapesJS + reveal.js).
 * Each Section3 becomes a reveal.js <section> slide.
 * Uses Tailwind CDN + semantic color theme (same as docs/landings v4).
 */
export function buildPresentationHtml(
  sections: Section3[],
  opts?: {
    title?: string;
    transition?: string;
    themeName?: string;
    customColors?: Record<string, string>;
  }
): string {
  const transition = opts?.transition || "slide";

  // Extract GrapesJS CSS section if present
  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);

  let grapesCSS = "";
  if (cssSection) {
    const match = cssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    grapesCSS = match?.[1] || "";
  }

  // Build theme CSS variables
  let themeCss = "";
  if (opts?.customColors && Object.keys(opts.customColors).length) {
    let colors = opts.customColors;
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

  // Build reveal.js slides from sections
  const slidesHtml = contentSections
    .map((s) => {
      // Strip GrapesJS editor attributes
      const cleanHtml = s.html
        .replace(/\s+contenteditable="[^"]*"/gi, "")
        .replace(/\s+data-gjs[^=]*="[^"]*"/gi, "");
      // If already wrapped in <section>, use as-is; otherwise wrap
      if (cleanHtml.trim().startsWith("<section")) {
        return cleanHtml;
      }
      return `<section>${cleanHtml}</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${opts?.title || "Presentation"}</title>
<link rel="stylesheet" href="${REVEAL_CDN}/dist/reset.css"/>
<link rel="stylesheet" href="${REVEAL_CDN}/dist/reveal.css"/>
<link rel="stylesheet" href="${REVEAL_CDN}/dist/theme/black.css"/>
<script src="https://cdn.tailwindcss.com"><\/script>
<script>
tailwind.config={theme:{extend:{colors:{primary:'var(--color-primary)','primary-light':'var(--color-primary-light)','primary-dark':'var(--color-primary-dark)',secondary:'var(--color-secondary)',accent:'var(--color-accent)',surface:'var(--color-surface)','surface-alt':'var(--color-surface-alt)','on-primary':'var(--color-on-primary)','on-secondary':'var(--color-on-secondary)','on-accent':'var(--color-on-accent)','on-surface':'var(--color-on-surface)','on-surface-muted':'var(--color-on-surface-muted)'}}}}
<\/script>
<style>
${themeCss}
.reveal section { overflow: hidden !important; box-sizing: border-box; }
.reveal h1, .reveal h2, .reveal h3 { text-transform: none; }
.reveal img { max-width: 100%; border-radius: 8px; }
${grapesCSS}
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">
${slidesHtml}
  </div>
</div>
<script src="${REVEAL_CDN}/dist/reveal.js"><\/script>
<script>
  Reveal.initialize({ hash: true, transition: '${transition}', width: 960, height: 540, margin: 0.04, minScale: 0.2, maxScale: 1.4 });
<\/script>
</body>
</html>`;
}
