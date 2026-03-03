import { type LandingSection, renderSection, getThemeVars } from "./landingCatalog";

export function buildLandingHtml(sections: LandingSection[], theme: string): string {
  const t = getThemeVars(theme);
  const body = sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `<div id="section-${s.id}">${s.html || renderSection(s, theme)}</div>`)
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
<script>
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
</script>
</body>
</html>`;
}
