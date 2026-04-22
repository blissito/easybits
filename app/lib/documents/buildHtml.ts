import type { Section3 } from "~/lib/landing3/types";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fix unbalanced HTML tags that break StPageFlip.
 * AI agents sometimes generate extra closing tags (e.g. </div> after </svg>).
 * This counts open/close tags for div/section/article/main and appends or
 * trims to balance them. Does NOT parse full DOM — just a safety net.
 */
function balanceHtmlTags(html: string): string {
  const tags = ["div", "section", "article", "main", "header", "footer", "nav", "aside"];
  let result = html;
  for (const tag of tags) {
    const openRe = new RegExp(`<${tag}[\\s>]`, "gi");
    const closeRe = new RegExp(`</${tag}>`, "gi");
    const opens = (result.match(openRe) || []).length;
    const closes = (result.match(closeRe) || []).length;
    if (closes > opens) {
      // Remove extra closing tags from the end
      let diff = closes - opens;
      while (diff > 0) {
        const idx = result.lastIndexOf(`</${tag}>`);
        if (idx === -1) break;
        result = result.slice(0, idx) + result.slice(idx + tag.length + 3);
        diff--;
      }
    } else if (opens > closes) {
      // Append missing closing tags
      let diff = opens - closes;
      while (diff > 0) {
        result += `</${tag}>`;
        diff--;
      }
    }
  }
  return result;
}

// Default theme CSS — always injected so semantic color classes work even if server fails to generate themeCss
const DEFAULT_THEME_CSS = `:root {
  --color-primary: #18181b; --color-primary-light: #3f3f46; --color-primary-dark: #09090b;
  --color-secondary: #71717a; --color-accent: #2563eb;
  --color-surface: #ffffff; --color-surface-alt: #f4f4f5;
  --color-on-surface: #18181b; --color-on-surface-muted: #71717a;
  --color-on-primary: #ffffff; --color-on-secondary: #ffffff; --color-on-accent: #ffffff;
}`;

/**
 * Build deployed document HTML — flipbook viewer with StPageFlip.
 * Desktop: double-page spread. Mobile: single page. Touch/swipe/keyboard.
 */
export function buildDocumentHtml(
  sections: Section3[],
  options?: {
    showBranding?: boolean;
    themeCss?: string;
    tailwindConfig?: string;
    title?: string;
    pdfUrl?: string;
    description?: string;
    url?: string;
    ogImage?: string;
    format?: { width: number; height: number };
  }
): string {
  const sorted = [...sections]
    .filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__")
    .sort((a, b) => a.order - b.order);
  const title = options?.title || "Documento";
  const totalPages = sorted.length;
  const format = options?.format;
  // Default letter at 96dpi; override with stored dimensions for carousels / slide decks.
  const pageW = format?.width ?? 816;
  const pageH = format?.height ?? 1056;

  // Extract GrapesJS CSS from the special __grapes_css__ section
  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  let grapesCss = "";
  if (cssSection) {
    const match = cssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    grapesCss = match?.[1] || "";
  }

  // Wrap each page's content in a scaling container.
  // Content is designed for 816px × 1056px (8.5in × 11in at 96dpi).
  // StPageFlip will set the .flipbook-page size; the inner wrapper scales to fit.
  const pagesHtml = sorted
    .map(
      (s, i) =>
        `<div class="flipbook-page" data-page="${i + 1}"><div class="page-inner">${balanceHtmlTags(s.html)}</div></div>`
    )
    .join("\n");

  const pdfButton = options?.pdfUrl
    ? `<a href="${options.pdfUrl}" target="_blank" rel="noreferrer" style="font-size:13px;color:#9870ED;background:none;border:none;cursor:pointer;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        PDF
      </a>`
    : `<button onclick="window.print()" style="font-size:13px;color:#9870ED;background:none;border:none;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        PDF
      </button>`;

  const branding =
    options?.showBranding !== false
      ? `<div class="doc-branding" style="text-align:center;padding:16px 0 8px;font-size:11px;color:#666;">
          Creado con <a href="https://www.easybits.cloud" style="color:#9870ED;text-decoration:none;font-weight:600;">EasyBits</a>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${options?.description ? `<meta name="description" content="${escapeAttr(options.description)}">` : ""}
  <meta property="og:title" content="${escapeAttr(title)}">
  ${options?.description ? `<meta property="og:description" content="${escapeAttr(options.description)}">` : ""}
  <meta property="og:type" content="article">
  ${options?.url ? `<meta property="og:url" content="${escapeAttr(options.url)}">` : ""}
  ${options?.ogImage ? `<meta property="og:image" content="${escapeAttr(options.ogImage)}">` : ""}
  <meta name="twitter:card" content="${options?.ogImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  ${options?.description ? `<meta name="twitter:description" content="${escapeAttr(options.description)}">` : ""}
  ${options?.ogImage ? `<meta name="twitter:image" content="${escapeAttr(options.ogImage)}">` : ""}
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${options?.tailwindConfig ? `<script>tailwind.config = ${options.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js"><\/script>
  <style>
    ${options?.themeCss || DEFAULT_THEME_CSS}
    ${grapesCss}
    html { height: 100%; }
    body {
      box-sizing: border-box;
      font-family: 'Inter', sans-serif;
      background: #1a1a1a;
      color: var(--color-on-surface, #111);
      height: 100%;
      margin: 0;
      display: flex;
      flex-direction: column;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-toolbar {
      position: sticky; top: 0; z-index: 100;
      background: #111; border-bottom: 1px solid #333;
      padding: 10px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: 'Inter', sans-serif;
    }
    .doc-toolbar h1 { font-size: 14px; font-weight: 600; color: #fff; }
    .doc-toolbar-right { display: flex; align-items: center; gap: 16px; }
    .page-nav {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #aaa; user-select: none;
    }
    .page-nav button {
      background: none; border: 1px solid #444; color: #ccc;
      width: 28px; height: 28px; border-radius: 6px;
      cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .page-nav button:hover { background: #333; }
    .page-nav button:disabled { opacity: 0.3; cursor: default; }
    .flipbook-container {
      flex: 1; display: flex; align-items: flex-start; justify-content: center;
      padding: 16px 16px;
      overflow: hidden;
      position: relative;
      min-height: 0;
      height: 0;
    }
    @media (min-width: 768px) {
      .flipbook-container { align-items: center; padding: 24px 16px; }
    }
    #flipbook {
      display: flex; align-items: center; justify-content: center;
    }
    .side-nav {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 48px; height: 48px; border-radius: 50%;
      background: rgba(0,0,0,0.5); border: none; color: #fff;
      font-size: 22px; cursor: pointer; z-index: 100;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, opacity 0.2s;
      backdrop-filter: blur(4px);
    }
    .side-nav:hover { background: rgba(0,0,0,0.7); }
    .side-nav:disabled { opacity: 0; pointer-events: none; }
    .side-nav.left { left: 16px; }
    .side-nav.right { right: 16px; }
    @media (max-width: 640px) {
      .side-nav { width: 36px; height: 36px; font-size: 18px; }
      .side-nav.left { left: 8px; }
      .side-nav.right { right: 8px; }
    }
    .flipbook-page {
      background: white;
      overflow: hidden;
    }
    .page-inner {
      width: ${pageW}px;
      height: ${pageH}px;
      transform-origin: top left;
      overflow: hidden;
    }
    /* Print: show pages vertically, hide toolbar */
    @page { size: ${format ? `${pageW}px ${pageH}px` : "letter"}; margin: 0; }
    @media print {
      html, body { height: auto !important; display: block !important; margin: 0 !important; padding: 0 !important; }
      .doc-toolbar, .page-nav, .flipbook-container, .doc-branding, #page-hint, .side-nav { display: none !important; }
      body { background: white; }
      .print-pages { display: block !important; }
      .print-page {
        width: ${pageW}px; height: ${pageH}px;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
        page-break-after: always; break-after: page;
        page-break-inside: avoid; break-inside: avoid;
      }
      .print-page:last-child { page-break-after: auto; break-after: auto; }
    }
    .print-pages { display: none; }
  </style>
</head>
<body>
<div class="doc-toolbar">
  <h1>${title}</h1>
  <div class="doc-toolbar-right">
    <div class="page-nav">
      <button id="prev-btn" aria-label="Página anterior">&larr;</button>
      <span id="page-indicator">1 / ${totalPages}</span>
      <button id="next-btn" aria-label="Página siguiente">&rarr;</button>
    </div>
    ${pdfButton}
  </div>
</div>

<div class="flipbook-container">
  <button id="side-prev" class="side-nav left" aria-label="Anterior">&#8249;</button>
  <div id="flipbook">
    ${pagesHtml}
  </div>
  <button id="side-next" class="side-nav right" aria-label="Siguiente">&#8250;</button>
</div>

<!-- Page turn hint -->
<div id="page-hint" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;z-index:200;pointer-events:none;transition:opacity 0.5s;display:flex;align-items:center;gap:8px;">
  <span style="font-size:18px;">&#8592;</span> Desliza o usa las flechas para navegar <span style="font-size:18px;">&#8594;</span>
</div>

${branding}

<!-- Print fallback (hidden, shown only in @media print) -->
<div class="print-pages">
  ${sorted.map((s) => `<div class="print-page">${s.html}</div>`).join("\n")}
</div>

<script>
(function() {
  var el = document.getElementById('flipbook');
  var W = Math.min(window.innerWidth - 32, 612);
  var H = Math.round(W * (11 / 8.5));

  var flip = new St.PageFlip(el, {
    width: W,
    height: H,
    size: 'fixed',
    minWidth: 300,
    maxWidth: 612,
    minHeight: 400,
    maxHeight: 792,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: true,
    startPage: 0,
    drawShadow: true,
    flippingTime: 600,
    startZIndex: 0,
    autoSize: true,
    maxShadowOpacity: 0.3,
  });

  flip.loadFromHTML(document.querySelectorAll('.flipbook-page'));

  // Scale page content to fit the flipbook page size
  function scalePages() {
    var pages = document.querySelectorAll('.page-inner');
    var scaleX = W / 816;
    var scaleY = H / 1056;
    var scale = Math.min(scaleX, scaleY);
    for (var i = 0; i < pages.length; i++) {
      pages[i].style.transform = 'scale(' + scale + ')';
    }
  }
  scalePages();

  var indicator = document.getElementById('page-indicator');
  var prevBtn = document.getElementById('prev-btn');
  var nextBtn = document.getElementById('next-btn');
  var sidePrev = document.getElementById('side-prev');
  var sideNext = document.getElementById('side-next');
  var total = ${totalPages};

  function updateNav() {
    var current = flip.getCurrentPageIndex() + 1;
    indicator.textContent = current + ' / ' + total;
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= total;
    sidePrev.disabled = current <= 1;
    sideNext.disabled = current >= total;
  }

  flip.on('flip', updateNav);
  updateNav();

  prevBtn.addEventListener('click', function() { flip.flipPrev(); });
  nextBtn.addEventListener('click', function() { flip.flipNext(); });
  sidePrev.addEventListener('click', function() { flip.flipPrev(); });
  sideNext.addEventListener('click', function() { flip.flipNext(); });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { flip.flipPrev(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { flip.flipNext(); }
  });

  // Dismiss hint after first flip or after 4 seconds
  var hint = document.getElementById('page-hint');
  function hideHint() { if (hint) { hint.style.opacity = '0'; setTimeout(function() { hint.remove(); }, 500); } }
  flip.on('flip', function() { hideHint(); });
  setTimeout(hideHint, 4000);

  // Responsive resize
  window.addEventListener('resize', function() {
    W = Math.min(window.innerWidth - 32, 612);
    H = Math.round(W * (11 / 8.5));
    flip.updateSetting({ width: W, height: H });
    flip.update();
    scalePages();
  });
})();
<\/script>
</body>
</html>`;
}

/**
 * Build print-optimized HTML for PDF generation (Playwright/Gotenberg).
 * Flat vertical layout, @page letter, no interactive elements.
 */
export function buildDocumentPrintHtml(
  sections: Section3[],
  options?: {
    themeCss?: string;
    tailwindConfig?: string;
    title?: string;
    format?: { width: number; height: number };
    /** If true, injects a client-side script that waits for Tailwind CDN + images, then calls window.print(). Use this for the editor's "Imprimir" flow — Playwright-based renderers should leave it off. */
    autoPrint?: boolean;
  }
): string {
  const sorted = [...sections]
    .filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__")
    .sort((a, b) => a.order - b.order);
  const title = options?.title || "Documento";
  const format = options?.format;
  const pageCss = format
    ? `@page { size: ${format.width}px ${format.height}px; margin: 0; }`
    : `@page { size: letter; margin: 0; }`;
  // `position: relative` is load-bearing: imported slide decks rely heavily on
  // absolute positioning for cover layouts. Without it, children anchor to the
  // viewport and only the first slide's header renders (rest is clipped/offset).
  const sectionSizeCss = format
    ? `.page-section { width: ${format.width}px; height: ${format.height}px; overflow: hidden; position: relative; box-sizing: border-box; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }`
    : `.page-section { width: 8.5in; height: 11in; overflow: hidden; position: relative; box-sizing: border-box; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }`;

  // Extract GrapesJS CSS
  const cssSection = sections.find((s) => s.id === "__grapes_css__");
  let grapesCss = "";
  if (cssSection) {
    const match = cssSection.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    grapesCss = match?.[1] || "";
  }

  const sectionsHtml = sorted
    .map((s) => `<div class="page-section">${s.html}</div>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${options?.tailwindConfig ? `<script>tailwind.config = ${options.tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${pageCss}
    ${options?.themeCss || DEFAULT_THEME_CSS}
    ${grapesCss}
    body { font-family: 'Inter', sans-serif; margin: 0; color: var(--color-on-surface, #111); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${sectionSizeCss}
    .page-section:last-child { page-break-after: auto; break-after: auto; }
  </style>
</head>
<body>
${sectionsHtml}
${options?.autoPrint ? `<script>
(function() {
  var printed = false;
  function doPrint() {
    if (printed) return;
    printed = true;
    var imgs = Array.from(document.images);
    var pending = imgs.filter(function(img) { return !img.complete; });
    if (pending.length === 0) { window.print(); return; }
    var loaded = 0;
    function check() { if (++loaded >= pending.length) window.print(); }
    pending.forEach(function(img) {
      img.addEventListener('load', check);
      img.addEventListener('error', check);
    });
    setTimeout(function() { window.print(); }, 5000);
  }
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].tagName === 'STYLE') {
          observer.disconnect();
          setTimeout(doPrint, 300);
          return;
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });
  setTimeout(function() { observer.disconnect(); doPrint(); }, 4000);
})();
<\/script>` : ''}
</body>
</html>`;
}

/**
 * Build preview HTML for the editor iframe (no Paged.js, simulates pages visually).
 */
export function buildDocumentPreviewHtml(sections: Section3[]): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionsHtml = sorted
    .map(
      (s, i) => `<div class="doc-page" data-section-id="${s.id}" id="section-${s.id}">
        ${s.html}
      </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 20px;
      background: #e5e7eb;
      color: var(--color-on-surface, #111);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .doc-page {
      width: 8.5in;
      height: 11in;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      padding: 0.75in;
      position: relative;
      cursor: pointer;
      transition: box-shadow 0.2s;
      overflow: hidden;
    }
    .doc-page:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    }
    .doc-page.selected {
      outline: 3px solid #9870ED;
      outline-offset: 2px;
    }
    .doc-page [contenteditable] {
      outline: none;
    }
  </style>
</head>
<body>
${sectionsHtml}
<script>
(function() {
  var selectedEl = null;
  var hoveredEl = null;
  var OUTLINE_HOVER = '2px solid #3B82F6';
  var OUTLINE_SELECTED = '2px solid #8B5CF6';

  function getSectionId(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.sectionId) return node.dataset.sectionId;
      node = node.parentElement;
    }
    return null;
  }

  function getSectionElement(sectionId) {
    return document.querySelector('[data-section-id="' + sectionId + '"]');
  }

  function getElementPath(el) {
    var parts = [];
    var node = el;
    while (node && node !== document.body) {
      var tag = node.tagName.toLowerCase();
      if (node.id) tag += '#' + node.id;
      var siblings = node.parentElement ? Array.from(node.parentElement.children).filter(function(c) { return c.tagName === node.tagName; }) : [];
      if (siblings.length > 1) tag += ':nth(' + siblings.indexOf(node) + ')';
      parts.unshift(tag);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function getCleanSectionHtml(sectionEl) {
    var els = sectionEl.querySelectorAll('*');
    var saved = [];
    for (var i = 0; i < els.length; i++) {
      var s = els[i].style;
      saved.push({ outline: s.outline, outlineOffset: s.outlineOffset, ce: els[i].contentEditable });
      s.outline = ''; s.outlineOffset = '';
      if (els[i].contentEditable === 'true') els[i].removeAttribute('contenteditable');
    }
    var rootOutline = sectionEl.style.outline;
    var rootOffset = sectionEl.style.outlineOffset;
    sectionEl.style.outline = ''; sectionEl.style.outlineOffset = '';
    var html = sectionEl.innerHTML;
    sectionEl.style.outline = rootOutline; sectionEl.style.outlineOffset = rootOffset;
    for (var i = 0; i < els.length; i++) {
      els[i].style.outline = saved[i].outline;
      els[i].style.outlineOffset = saved[i].outlineOffset;
      if (saved[i].ce === 'true') els[i].contentEditable = 'true';
    }
    return html;
  }

  function isTextElement(el) {
    var textTags = ['H1','H2','H3','H4','H5','H6','P','SPAN','LI','A','BLOCKQUOTE','LABEL','TD','TH','FIGCAPTION'];
    return textTags.indexOf(el.tagName) !== -1;
  }

  // Hover highlight
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    if (el === selectedEl) return;
    if (hoveredEl && hoveredEl !== selectedEl) { hoveredEl.style.outline = ''; hoveredEl.style.outlineOffset = ''; }
    hoveredEl = el;
    if (el !== selectedEl) { el.style.outline = OUTLINE_HOVER; el.style.outlineOffset = '-2px'; }
  });

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl && hoveredEl !== selectedEl) { hoveredEl.style.outline = ''; hoveredEl.style.outlineOffset = ''; }
    hoveredEl = null;
  });

  // Click — select element, prevent link navigation
  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;

    if (selectedEl) { selectedEl.style.outline = ''; selectedEl.style.outlineOffset = ''; }

    if (selectedEl === el) {
      selectedEl = null;
      document.querySelectorAll('.doc-page').forEach(function(p) { p.classList.remove('selected'); });
      window.parent.postMessage({ type: 'element-deselected' }, '*');
      return;
    }

    selectedEl = el;

    // Highlight the page
    var page = el.closest('.doc-page');
    document.querySelectorAll('.doc-page').forEach(function(p) { p.classList.remove('selected'); });
    if (page) page.classList.add('selected');

    el.style.outline = ''; el.style.outlineOffset = '';
    var openTag = el.outerHTML.substring(0, el.outerHTML.indexOf('>') + 1).substring(0, 120);
    el.style.outline = OUTLINE_SELECTED; el.style.outlineOffset = '-2px';

    var rect = el.getBoundingClientRect();
    var sectionId = getSectionId(el);
    var attrs = {};
    if (el.tagName === 'IMG') attrs = { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' };
    if (el.tagName === 'A') attrs = { href: el.getAttribute('href') || '', target: el.getAttribute('target') || '' };

    window.parent.postMessage({
      type: 'element-selected',
      sectionId: sectionId,
      tagName: el.tagName,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      text: (el.textContent || '').substring(0, 200),
      openTag: openTag,
      elementPath: getElementPath(el),
      isSectionRoot: !!(el.dataset && el.dataset.sectionId),
      attrs: attrs,
    }, '*');
  }, true);

  // Double-click — contentEditable for text elements
  document.addEventListener('dblclick', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!isTextElement(el)) return;

    el.contentEditable = 'true';
    el.focus();
    el.style.outline = '2px dashed #F59E0B';
    el.style.outlineOffset = '-2px';

    function onBlur() {
      el.contentEditable = 'false';
      el.style.outline = ''; el.style.outlineOffset = '';
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKeydown);

      var sid = getSectionId(el);
      var sectionEl = sid ? getSectionElement(sid) : null;
      window.parent.postMessage({
        type: 'text-edited',
        sectionId: sid,
        elementPath: getElementPath(el),
        newText: el.innerHTML,
        sectionHtml: sectionEl ? getCleanSectionHtml(sectionEl) : null,
      }, '*');
      selectedEl = null;
    }

    function onKeydown(ev) {
      if (ev.key === 'Escape') el.blur();
    }

    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKeydown);
  }, true);

  // Listen for messages from parent
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.action) return;

    if (msg.action === 'update-section') {
      var el = getSectionElement(msg.id);
      if (el) el.innerHTML = msg.html;
    }

    if (msg.action === 'update-attribute') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl) {
        var target = null;
        if (msg.elementPath) {
          var allEls = sectionEl.querySelectorAll(msg.tagName || '*');
          for (var i = 0; i < allEls.length; i++) {
            if (getElementPath(allEls[i]) === msg.elementPath) { target = allEls[i]; break; }
          }
        }
        if (target) {
          target.setAttribute(msg.attr, msg.value);
          window.parent.postMessage({
            type: 'section-html-updated',
            sectionId: msg.sectionId,
            sectionHtml: getCleanSectionHtml(sectionEl),
          }, '*');
        }
      }
    }

    if (msg.action === 'set-custom-css') {
      var customStyle = document.getElementById('custom-theme-css');
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.id = 'custom-theme-css';
        document.head.appendChild(customStyle);
      }
      customStyle.textContent = msg.css || '';
    }
  });

  // Run Chart.js scripts after DOM
  document.querySelectorAll('script[type="text/chartjs"]').forEach(function(s) {
    try { eval(s.textContent); } catch(e) { console.error('Chart error:', e); }
  });
})();
<\/script>
</body>
</html>`;
}
