import type { Section3 } from "./types";
import { getIframeScript } from "./iframeScript";
import { buildThemeCss, buildSingleThemeCss, buildCustomTheme, type CustomColors } from "./themes";

/**
 * Build the full HTML for the iframe preview (with editing script).
 */
export function buildPreviewHtml(sections: Section3[], theme?: string): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const body = sorted
    .map((s) => `<div data-section-id="${s.id}">${s.html}</div>`)
    .join("\n");

  const dataTheme = theme && theme !== "default" ? ` data-theme="${theme}"` : "";
  const { css, tailwindConfig } = buildThemeCss();

  return `<!DOCTYPE html>
<html lang="es"${dataTheme}>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = ${tailwindConfig}</script>
<style>
${css}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,sans-serif}
img{max-width:100%}
[contenteditable="true"]{cursor:text}
</style>
</head>
<body>
${body}
<script>${getIframeScript()}</script>
</body>
</html>`;
}

/**
 * Build the deploy HTML (no editing script, clean output).
 */
export function buildDeployHtml(sections: Section3[], theme?: string, customColors?: CustomColors): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const body = sorted.map((s) => s.html).join("\n");

  const isCustom = theme === "custom" && customColors;
  const dataTheme = theme && theme !== "default" && !isCustom ? ` data-theme="${theme}"` : "";

  // For custom theme, build CSS from the custom colors directly (no data-theme needed, inject as :root)
  const { css: baseCss, tailwindConfig } = isCustom
    ? (() => {
        const ct = buildCustomTheme(customColors);
        const vars = Object.entries(ct.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n");
        return { css: `:root {\n${vars}\n}`, tailwindConfig: buildSingleThemeCss("default").tailwindConfig };
      })()
    : buildSingleThemeCss(theme || "default");

  return `<!DOCTYPE html>
<html lang="es"${dataTheme}>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = ${tailwindConfig}</script>
<style>
${baseCss}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,sans-serif}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
