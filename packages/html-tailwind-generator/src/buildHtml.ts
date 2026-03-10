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
<script src="https://unpkg.com/morphdom@2.7.4/dist/morphdom-umd.min.js"></script>
<script>tailwind.config = ${tailwindConfig}</script>
<style>
${css}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,sans-serif;background-color:var(--color-surface);color:var(--color-on-surface)}
img{max-width:100%}
section{width:100%}
section>*{max-width:80rem;margin-left:auto;margin-right:auto;padding-left:1rem;padding-right:1rem}
[contenteditable="true"]{cursor:text}
</style>
</head>
<body class="bg-surface text-on-surface">
${body}
<script>${getIframeScript()}</script>
</body>
</html>`;
}

/**
 * Build the deploy HTML (no editing script, clean output).
 */
/**
 * Remove editor artifacts (outline, outlineOffset, contenteditable) from HTML before deploy.
 */
function stripEditorArtifacts(html: string): string {
  return html
    .replace(/\s*outline:\s*[^;"]+;?/gi, "")
    .replace(/\s*outline-offset:\s*[^;"]+;?/gi, "")
    .replace(/\s*style="\s*"/gi, "")
    .replace(/\s+contenteditable="[^"]*"/gi, "")
    .replace(/\s+data-section-id="[^"]*"/gi, "")
}

export function buildDeployHtml(sections: Section3[], theme?: string, customColors?: CustomColors, showBranding = true): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const body = sorted.map((s) => stripEditorArtifacts(s.html)).join("\n");

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
body{font-family:system-ui,-apple-system,sans-serif;background-color:var(--color-surface);color:var(--color-on-surface)}
section{width:100%}
section>*{max-width:80rem;margin-left:auto;margin-right:auto;padding-left:1rem;padding-right:1rem}
</style>
</head>
<body class="bg-surface text-on-surface">
${body}
${showBranding ? `<div style="text-align:center;padding:16px 0 12px;font-size:12px">
  <a href="https://www.easybits.cloud" target="_blank" rel="noopener"
     style="color:#9ca3af;text-decoration:none">
    Powered by easybits.cloud
  </a>
</div>` : ""}
</body>
</html>`;
}
