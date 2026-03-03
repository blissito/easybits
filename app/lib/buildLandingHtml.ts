import { type LandingSection, renderSection, getThemeVars } from "./landingCatalog";

export type CustomColors = { bg: string; accent: string; text: string };

export function buildLandingHtml(
  sections: LandingSection[],
  theme: string,
  customColors?: CustomColors | null,
  { preview = false }: { preview?: boolean } = {},
): string {
  const t = customColors ?? getThemeVars(theme);
  const body = sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `<div id="section-${s.id}">${s.html || renderSection(s)}</div>`)
    .join("\n");

  // Compute a contrasting accent-text color (white or black) for readability on accent bg
  const accentLum = hexLuminance(t.accent);
  const accentText = accentLum > 0.4 ? "#000000" : "#ffffff";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root{--landing-bg:${t.bg};--landing-accent:${t.accent};--landing-text:${t.text};--landing-accent-text:${accentText}}
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:system-ui,-apple-system,sans-serif;background:var(--landing-bg);color:var(--landing-text)}
  details summary::-webkit-details-marker{display:none}
</style>
</head>
<body>
${body}
${preview ? `<script>
window.addEventListener("message",function(e){
  if(e.data&&e.data.type==="scrollToSection"){
    var el=document.getElementById("section-"+e.data.id);
    if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
  }
});
document.addEventListener("click",function(e){
  var a=e.target.closest("a");
  if(a){e.preventDefault();e.stopPropagation();}
},true);
</script>` : ""}
</body>
</html>`;
}

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
