import type { Section3 } from "~/lib/landing3/types";

/**
 * Build full HTML document for letter-sized pages with Paged.js.
 * Each section = one letter page (8.5" × 11").
 */
export function buildDocumentHtml(
  sections: Section3[],
  options?: { showBranding?: boolean }
): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionsHtml = sorted
    .map(
      (s) => `<div class="page-section">${s.html}</div>`
    )
    .join("\n");

  const branding = options?.showBranding !== false
    ? `<div style="position:fixed;bottom:8px;right:12px;font-size:9px;color:#999;z-index:9999;">
        Creado con <a href="https://easybits.cloud" style="color:#9870ED;text-decoration:none;">EasyBits</a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documento</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"><\/script>
  <style>
    @page {
      size: letter;
      margin: 0.75in;
    }

    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-section {
      page-break-after: always;
      min-height: 100%;
    }

    .page-section:last-child {
      page-break-after: auto;
    }

    /* Ensure charts render for print */
    canvas {
      max-width: 100%;
    }
  </style>
</head>
<body>
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
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .doc-page {
      width: 8.5in;
      min-height: 11in;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      padding: 0.75in;
      position: relative;
      cursor: pointer;
      transition: box-shadow 0.2s;
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
  // Click to select page (section)
  document.querySelectorAll('.doc-page').forEach(page => {
    page.addEventListener('click', (e) => {
      const sectionId = page.dataset.sectionId;
      document.querySelectorAll('.doc-page').forEach(p => p.classList.remove('selected'));
      page.classList.add('selected');
      window.parent.postMessage({
        type: 'element-selected',
        sectionId,
        tagName: 'SECTION',
        text: page.textContent?.substring(0, 80) || '',
      }, '*');
    });
  });

  // Text editing
  document.querySelectorAll('.doc-page [data-editable]').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('blur', () => {
      const page = el.closest('.doc-page');
      if (!page) return;
      window.parent.postMessage({
        type: 'text-edited',
        sectionId: page.dataset.sectionId,
        sectionHtml: page.innerHTML,
      }, '*');
    });
  });

  // Deselect on click outside pages
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.doc-page')) {
      document.querySelectorAll('.doc-page').forEach(p => p.classList.remove('selected'));
      window.parent.postMessage({ type: 'element-deselected' }, '*');
    }
  });

  // Run Chart.js scripts after DOM
  document.querySelectorAll('script[type="text/chartjs"]').forEach(s => {
    try { eval(s.textContent); } catch(e) { console.error('Chart error:', e); }
  });
<\/script>
</body>
</html>`;
}
