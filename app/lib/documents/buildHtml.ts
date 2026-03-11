import type { Section3 } from "~/lib/landing3/types";

/**
 * Build deployed document HTML — identical structure to handleExportPdf in editor.
 * Uses Tailwind CDN + theme CSS, @page letter with margin 0, no Paged.js.
 * Includes a toolbar with title + "Descargar PDF" button (window.print).
 */
export function buildDocumentHtml(
  sections: Section3[],
  options?: {
    showBranding?: boolean;
    themeCss?: string;
    tailwindConfig?: string;
    title?: string;
  }
): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionsHtml = sorted
    .map((s) => `<div class="page-section">${s.html}</div>`)
    .join("\n");

  const title = options?.title || "Documento";

  const branding = options?.showBranding !== false
    ? `<div class="doc-toolbar" style="position:fixed;bottom:8px;right:12px;font-size:9px;color:#999;z-index:9999;">
        Creado con <a href="https://www.easybits.cloud" style="color:#9870ED;text-decoration:none;">EasyBits</a>
      </div>`
    : "";

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
    @page { size: letter; margin: 0; }
    ${options?.themeCss || ""}
    body { font-family: 'Inter', sans-serif; margin: 0; color: var(--color-on-surface, #111); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section { width: 8.5in; height: 11in; overflow: hidden; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
    .page-section:last-child { page-break-after: auto; break-after: auto; }
    .doc-toolbar { font-family: 'Inter', sans-serif; }
    @media print { .doc-toolbar { display: none !important; } }
  </style>
</head>
<body>
<div class="doc-toolbar" style="position:sticky;top:0;z-index:10000;background:white;border-bottom:1px solid #e5e7eb;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;">
  <h1 style="font-size:14px;font-weight:600;color:#111;margin:0;">${title}</h1>
  <button onclick="window.print()" style="font-size:13px;color:#9870ED;background:none;border:none;cursor:pointer;font-weight:500;">Descargar PDF</button>
</div>
${sectionsHtml}
${branding}
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
