import { type LandingSection, renderSection, getThemeVars } from "./landingCatalog";

export function buildLandingHtml(sections: LandingSection[], theme: string): string {
  const t = getThemeVars(theme);
  const body = sections
    .sort((a, b) => a.order - b.order)
    .map((s) => s.html || renderSection(s, theme))
    .join("\n");

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
  body{font-family:system-ui,-apple-system,sans-serif;background:${t.bg};color:${t.text}}
  details summary::-webkit-details-marker{display:none}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
