import type { LandingBlock } from "./blockTypes";
import { getThemeVars } from "../landingCatalog";
import type { CustomColors } from "../buildLandingHtml";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function renderBlock(block: LandingBlock): string {
  const c = block.content;
  switch (block.type) {
    case "hero": {
      const headline = esc(c.headline || "");
      const subtitle = esc(c.subtitle || "");
      const ctaText = esc(c.ctaText || "");
      const ctaUrl = esc(c.ctaUrl || "#");
      const imageUrl = c.imageUrl || "";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="relative overflow-hidden">
  <div class="max-w-7xl mx-auto px-6 py-24 lg:py-32 flex flex-col lg:flex-row items-center gap-12">
    <div class="flex-1 text-center lg:text-left">
      <h1 class="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">${headline}</h1>
      ${subtitle ? `<p class="mt-6 text-xl opacity-80 max-w-xl">${subtitle}</p>` : ""}
      ${ctaText ? `<div class="mt-10"><a href="${ctaUrl}" style="background:var(--landing-accent);color:var(--landing-accent-text)" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition">${ctaText}</a></div>` : ""}
    </div>
    ${imageUrl ? `<div class="flex-1"><img src="${esc(imageUrl)}" alt="" class="w-full max-w-lg mx-auto rounded-2xl shadow-2xl" /></div>` : ""}
  </div>
</section>`;
    }
    case "text": {
      const title = esc(c.title || "");
      const body = esc(c.body || "");
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold mb-6">${title}</h2>` : ""}
    <div class="text-lg leading-relaxed opacity-80 space-y-4">${body.split("\n").map((p) => `<p>${p}</p>`).join("")}</div>
  </div>
</section>`;
    }
    case "imageText": {
      const title = esc(c.title || "");
      const body = esc(c.body || "");
      const imageUrl = esc(c.imageUrl || "");
      const imgLeft = c.imagePosition === "left";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6 flex flex-col ${imgLeft ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-12">
    <div class="flex-1">
      <img src="${imageUrl}" alt="" class="w-full rounded-2xl shadow-xl" />
    </div>
    <div class="flex-1">
      ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold mb-4">${title}</h2>` : ""}
      <p class="text-lg opacity-80 leading-relaxed">${body}</p>
    </div>
  </div>
</section>`;
    }
    case "cta": {
      const headline = esc(c.headline || "");
      const subtitle = esc(c.subtitle || "");
      const ctaText = esc(c.ctaText || "");
      const ctaUrl = esc(c.ctaUrl || "#");
      return `<section style="background:var(--landing-accent);color:var(--landing-accent-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <h2 class="text-3xl lg:text-4xl font-extrabold">${headline}</h2>
    ${subtitle ? `<p class="mt-4 text-lg opacity-80 max-w-xl mx-auto">${subtitle}</p>` : ""}
    ${ctaText ? `<div class="mt-10"><a href="${ctaUrl}" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition" style="background:var(--landing-bg);color:var(--landing-accent)">${ctaText}</a></div>` : ""}
  </div>
</section>`;
    }
    case "footer": {
      const companyName = esc(c.companyName || "Company");
      const links: { label: string; url?: string }[] = c.links || [];
      return `<footer style="background:var(--landing-text);color:var(--landing-bg)" class="py-12">
  <div class="max-w-7xl mx-auto px-6">
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      <p class="font-bold text-lg">${companyName}</p>
      ${links.length ? `<nav class="flex flex-wrap gap-6 text-sm opacity-70">${links.map((l) => `<a href="${esc(l.url || "#")}" class="hover:opacity-100 transition">${esc(l.label)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="mt-8 pt-6 border-t border-white/10 text-center text-sm opacity-50">
      &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>
  </div>
</footer>`;
    }
    default:
      return `<!-- unknown block type: ${block.type} -->`;
  }
}

export function buildLandingHtml2(
  blocks: LandingBlock[],
  theme: string,
  customColors?: CustomColors | null,
): string {
  const t = customColors ?? getThemeVars(theme);
  const accentLum = hexLuminance(t.accent);
  const accentText = accentLum > 0.4 ? "#000000" : "#ffffff";

  const body = blocks
    .sort((a, b) => a.order - b.order)
    .map((b) => `<div id="block-${b.id}">${renderBlock(b)}</div>`)
    .join("\n");

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
</style>
</head>
<body>
${body}
</body>
</html>`;
}
