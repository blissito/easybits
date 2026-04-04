import type { Section3 } from "~/lib/landing3/types";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";

/**
 * Build deploy HTML for presentations v2.
 * No reveal.js — simple fullscreen slide viewer with keyboard/arrow navigation.
 * Tailwind CDN + semantic color theme (same as docs/landings v4).
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

  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);

  let grapesCSS = "";
  if (cssSection) {
    const match = cssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    grapesCSS = match?.[1] || "";
  }

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
    } catch { /* fallback */ }
  }

  // Transition CSS class
  const transitionCss = transition === "fade"
    ? `.slide { opacity: 0; transition: opacity 0.5s ease; } .slide.active { opacity: 1; }`
    : transition === "zoom"
    ? `.slide { transform: scale(0.8); opacity: 0; transition: all 0.5s ease; } .slide.active { transform: scale(1); opacity: 1; }`
    : `.slide { transform: translateX(100%); transition: transform 0.4s ease; } .slide.active { transform: translateX(0); } .slide.prev { transform: translateX(-100%); }`;

  const slidesHtml = contentSections
    .map((s, i) => {
      const cleanHtml = s.html
        .replace(/\s+contenteditable="[^"]*"/gi, "")
        .replace(/\s+data-gjs[^=]*="[^"]*"/gi, "")
        .replace(/\s+data-section-id="[^"]*"/gi, "")
        .replace(/\s+data-label="[^"]*"/gi, "");
      // Keep original HTML intact — it has all the layout/color classes
      let inner = cleanHtml.trim();
      return `<div class="slide${i === 0 ? " active" : ""}" data-index="${i}">${inner}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${opts?.title || "Presentation"}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<script>
tailwind.config={theme:{extend:{colors:{primary:'var(--color-primary)','primary-light':'var(--color-primary-light)','primary-dark':'var(--color-primary-dark)',secondary:'var(--color-secondary)',accent:'var(--color-accent)',surface:'var(--color-surface)','surface-alt':'var(--color-surface-alt)','on-primary':'var(--color-on-primary)','on-secondary':'var(--color-on-secondary)','on-accent':'var(--color-on-accent)','on-surface':'var(--color-on-surface)','on-surface-muted':'var(--color-on-surface-muted)'}}}}
<\/script>
<style>
${themeCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; font-family: system-ui, -apple-system, sans-serif; }
.viewport { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; container-type: size; }
.slide-container { width: 960px; height: 540px; position: relative; transform-origin: center center; scale: min(calc(100cqw / 960), calc(100cqh / 540)); }
.slide { position: absolute; inset: 0; width: 960px; height: 540px; overflow: hidden; }
${transitionCss}
img { max-width: 100%; border-radius: 8px; }

/* Navigation */
.nav-btn { position: fixed; top: 50%; transform: translateY(-50%); z-index: 50; width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.1); border: none; color: rgba(255,255,255,0.6); font-size: 20px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
.nav-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
.nav-btn.left { left: 16px; }
.nav-btn.right { right: 16px; }
.progress { position: fixed; bottom: 0; left: 0; height: 3px; background: var(--color-primary, #6366f1); transition: width 0.3s ease; z-index: 50; }
.slide-counter { position: fixed; bottom: 12px; right: 16px; font-size: 12px; color: rgba(255,255,255,0.4); z-index: 50; font-family: monospace; }
.branding { position: fixed; bottom: 12px; left: 16px; font-size: 10px; z-index: 50; }
.branding a { color: rgba(255,255,255,0.3); text-decoration: none; }
.branding a:hover { color: rgba(255,255,255,0.6); }
@media (max-width: 640px) {
  .nav-btn { width: 36px; height: 36px; font-size: 16px; }
  .nav-btn.left { left: 8px; }
  .nav-btn.right { right: 8px; }
}
.pdf-btn { position: fixed; top: 12px; right: 16px; z-index: 50; background: rgba(255,255,255,0.1); border: none; color: rgba(255,255,255,0.6); font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 14px; border-radius: 6px; backdrop-filter: blur(4px); display: flex; align-items: center; gap: 4px; transition: all 0.2s; font-family: system-ui, sans-serif; }
.pdf-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
.pdf-btn svg { width: 14px; height: 14px; }
@page { size: 960px 540px; margin: 0; }
@media print {
  html, body { background: white; overflow: visible; height: auto; }
  .viewport { container-type: normal; display: block; width: auto; height: auto; overflow: visible; }
  .slide-container { scale: 1; transform: none; width: 960px; height: auto; overflow: visible; position: static; }
  .nav-btn, .progress, .slide-counter, .branding, .pdf-btn { display: none !important; }
  .slide { position: relative !important; width: 960px !important; height: 540px !important; opacity: 1 !important; transform: none !important; display: block !important; page-break-after: always; break-after: page; overflow: hidden; }
  .slide:last-child { page-break-after: auto; break-after: auto; }
}
${grapesCSS}
</style>
</head>
<body>
<div class="viewport">
  <div class="slide-container">
${slidesHtml}
  </div>
</div>
<button class="nav-btn left" onclick="prev()" aria-label="Previous">&larr;</button>
<button class="nav-btn right" onclick="next()" aria-label="Next">&rarr;</button>
<div class="progress" id="progress"></div>
<div class="slide-counter" id="counter"></div>
<div class="branding"><a href="https://easybits.cloud" target="_blank">Powered by EasyBits</a></div>
<button class="pdf-btn" onclick="window.print()" aria-label="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>PDF</button>
<script>
  let current = 0;
  const slides = document.querySelectorAll('.slide');
  const total = slides.length;
  function show(idx) {
    if (idx < 0 || idx >= total) return;
    slides.forEach((s, i) => {
      s.classList.remove('active', 'prev');
      if (i === idx) s.classList.add('active');
      else if (i < idx) s.classList.add('prev');
    });
    current = idx;
    document.getElementById('progress').style.width = ((current + 1) / total * 100) + '%';
    document.getElementById('counter').textContent = (current + 1) + ' / ' + total;
    history.replaceState(null, '', '#' + (current + 1));
  }
  function next() { show(current + 1); }
  function prev() { show(current - 1); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'Home') { e.preventDefault(); show(0); }
    if (e.key === 'End') { e.preventDefault(); show(total - 1); }
  });
  // Touch swipe
  let touchX = 0;
  document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) dx > 0 ? prev() : next();
  });
  // Hash navigation
  const hash = parseInt(location.hash.slice(1));
  show(hash > 0 && hash <= total ? hash - 1 : 0);
  // PostMessage API (for iframe embedding)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'goToSlide') show(e.data.index);
  });
<\/script>
</body>
</html>`;
}
