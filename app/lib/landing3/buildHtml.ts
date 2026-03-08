import type { Section3 } from "./types";
import { getIframeScript } from "./iframeScript";

/**
 * Build the full HTML for the iframe preview (with editing script).
 */
export function buildPreviewHtml(sections: Section3[]): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const body = sorted
    .map((s) => `<div data-section-id="${s.id}">${s.html}</div>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
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
export function buildDeployHtml(sections: Section3[]): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const body = sorted.map((s) => s.html).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
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
