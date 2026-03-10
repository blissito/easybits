import { streamGenerate, dataUrlToImagePart } from "./streamCore";
import type { Section3 } from "./types";

export const DOCUMENT_SYSTEM_PROMPT = `You are a professional document designer who creates stunning letter-sized (8.5" × 11") document pages using HTML + Tailwind CSS.

RULES:
- Each page is a <section> element sized for letter paper
- Page structure: <section class="w-[8.5in] min-h-[11in] relative overflow-hidden">
- The section itself has NO padding — backgrounds, gradients, and decorative elements go edge-to-edge
- For text content, use an inner wrapper: <div class="px-[0.75in] py-[0.5in]">...content...</div>
- Cover pages and decorative sections can use full-bleed backgrounds (bg-primary, gradients, images that fill the entire page)
- Content MUST NOT overflow page boundaries — be conservative with spacing
- Use Tailwind CDN classes ONLY (no custom CSS, no @apply, no @import)
- NO JavaScript, only HTML+Tailwind
- All text content in Spanish unless the prompt specifies otherwise
- Use real content from the source material, not Lorem ipsum
- NOT responsive — fixed letter size, no breakpoints needed
- Sections can have ANY background — full-bleed color, gradients, or white. Not limited to white paper.

STRICT PROHIBITIONS:
1. **NO EMOJI** — Never use emoji characters (🚀❌✅📊 etc.). Instead use inline SVG icons or colored divs. For bullet decorators use small colored circles (<span class="w-2 h-2 rounded-full bg-primary inline-block"></span>) or simple SVG.
2. **NO Chart.js / NO JavaScript** — Never reference Chart.js, canvas, or any JS library. For data visualization use pure CSS: progress bars (div with percentage width + bg-primary), horizontal bars, styled tables with colored cells. Never use <canvas> or <script>.
3. **NO buttons or CTAs** — This is a print document, not a web page. No "Contactar", "Ver más", "Comprar" buttons. Use text with contact info instead.
4. **CONTRAST IS MANDATORY** — Dark/colored backgrounds (bg-primary, bg-primary-dark, bg-secondary, dark gradients) MUST use text-white or text-on-primary. Light backgrounds (white, bg-surface, bg-surface-alt) MUST use text-gray-900 or text-on-surface. NEVER use dark text on dark backgrounds or light text on light backgrounds.
5. **Max 2 font weights per page** — Pick 2 (e.g. font-semibold + font-normal, or font-bold + font-light). Don't mix 4-5 weights.
6. **Generous whitespace** — Don't fill every centimeter. Leave breathing room. Use py-8, py-12, gap-6, gap-8 liberally. Less content per page = more professional.

LAYOUT OVERFLOW PREVENTION — CRITICAL:
- Max 2 columns side by side — each with w-1/2. NEVER use 3+ columns.
- Decorative sidebars: max w-16 (4rem). NEVER use w-[2.5in] or wider sidebars — they steal too much space.
- Stats/metric grids: max 3 items per row (grid-cols-3). Use gap-4 or gap-6.
- Tables: max 4 columns, use text-xs or text-sm for cell text, px-3 py-2 cell padding.
- Images: always w-full or max-w-[50%] — never fixed pixel widths.
- Text: never use text-6xl or larger except for cover page title. Body text: text-sm or text-base.
- NEVER use absolute positioning that could overflow — prefer flex/grid layouts.

DESIGN:
- Clean, sophisticated layouts — think McKinsey reports, annual reports, premium proposals
- Typography: strong hierarchy with just 2 weights, clear headings vs body
- Tables: alternating row colors (bg-surface-alt), clean borders, generous cell padding (px-4 py-3)
- Decorative elements: colored sidebars, header bands, geometric accent shapes (pure CSS divs with bg-primary)
- First page MUST be a cover/title page with impactful design
- For numerical data: CSS progress bars, styled tables with colored cells, large stat numbers — NEVER canvas/charts
- Icons: use simple inline SVG (12-20px) for visual accents. Keep SVGs minimal (single path, no complex illustrations)

CSS PROGRESS BARS — use this pattern for data visualization:
<div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-primary h-3 rounded-full" style="width: 75%"></div></div>

COLOR SYSTEM — use semantic classes:
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- Cover pages should use bold full-bleed backgrounds (bg-primary, gradients from-primary to-primary-dark)
- CONTRAST: bg-primary/bg-primary-dark/bg-secondary → text-white or text-on-primary. White/bg-surface → text-gray-900 or text-on-surface

IMAGES:
- EVERY image MUST use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image
- For avatar-like elements, use colored divs with initials instead of img tags

CHARTS & DATA VISUALIZATION (SVG):
- For charts, diagrams, and decorative data graphics, use:
  <div data-svg-chart="bar chart showing Q1 revenue: Jan $45K, Feb $52K, Mar $61K" class="w-full"></div>
- The system generates professional SVG charts with a specialized tool — NEVER draw SVGs yourself
- Use descriptive prompts with data points: type of chart + what it shows + actual values
- Examples: "donut chart: 40% Marketing, 30% Sales, 20% R&D, 10% Admin", "line chart showing growth: Q1 $100K, Q2 $150K, Q3 $220K, Q4 $310K"
- For simple metrics, still prefer CSS progress bars (they render faster)

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders

EXAMPLE — Cover page (simple, no wide sidebars):
<section class="w-[8.5in] min-h-[11in] relative overflow-hidden bg-white">
  <div class="absolute left-0 top-0 w-2 h-full bg-primary"></div>
  <div class="flex flex-col justify-center h-[11in] px-[1in]">
    <div class="text-sm font-normal text-primary mb-4">Marzo 2026 · Versión 1.0</div>
    <h1 class="text-5xl font-bold text-gray-900 leading-tight">Reporte<br/>Trimestral</h1>
    <div class="w-16 h-1 bg-primary mt-6 mb-4"></div>
    <p class="text-lg font-normal text-gray-500">Resultados y análisis del primer trimestre</p>
  </div>
</section>

EXAMPLE — Content page with table + progress bars:
<section class="w-[8.5in] min-h-[11in] relative overflow-hidden bg-white">
  <div class="h-1.5 bg-primary w-full"></div>
  <div class="px-[0.75in] py-[0.5in]">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Métricas de Rendimiento</h2>
    <p class="text-sm font-normal text-gray-500 mb-8">Indicadores clave del periodo enero—marzo</p>
    <table class="w-full text-sm mb-10">
      <thead><tr class="bg-primary text-white"><th class="px-4 py-3 text-left font-semibold">Indicador</th><th class="px-4 py-3 text-left font-semibold">Valor</th><th class="px-4 py-3 text-left font-semibold">Meta</th></tr></thead>
      <tbody>
        <tr class="bg-surface-alt"><td class="px-4 py-3 text-gray-900">Ingresos</td><td class="px-4 py-3 text-gray-900">$1.2M</td><td class="px-4 py-3 text-gray-900">$1.5M</td></tr>
        <tr><td class="px-4 py-3 text-gray-900">Clientes nuevos</td><td class="px-4 py-3 text-gray-900">340</td><td class="px-4 py-3 text-gray-900">300</td></tr>
        <tr class="bg-surface-alt"><td class="px-4 py-3 text-gray-900">Retención</td><td class="px-4 py-3 text-gray-900">92%</td><td class="px-4 py-3 text-gray-900">90%</td></tr>
      </tbody>
    </table>
    <h3 class="text-lg font-bold text-gray-900 mb-4">Progreso por Área</h3>
    <div class="space-y-4">
      <div><div class="flex justify-between text-sm mb-1"><span class="text-gray-900 font-semibold">Ventas</span><span class="text-gray-500">80%</span></div><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-primary h-3 rounded-full" style="width: 80%"></div></div></div>
      <div><div class="flex justify-between text-sm mb-1"><span class="text-gray-900 font-semibold">Marketing</span><span class="text-gray-500">65%</span></div><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-secondary h-3 rounded-full" style="width: 65%"></div></div></div>
      <div><div class="flex justify-between text-sm mb-1"><span class="text-gray-900 font-semibold">Producto</span><span class="text-gray-500">95%</span></div><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-accent h-3 rounded-full" style="width: 95%"></div></div></div>
    </div>
  </div>
</section>`;

export const DOCUMENT_PROMPT_SUFFIX = `

OUTPUT FORMAT: NDJSON — one JSON object per line, NO wrapper array, NO markdown fences.
Each line: {"label": "Page Title", "html": "<section class='w-[8.5in] min-h-[11in] relative overflow-hidden'>...</section>"}

Generate 3-8 pages depending on content length. First page = cover/title page.
Each page must fit within letter size (8.5" × 11"). Be conservative with spacing.
Make each page visually distinct — different layouts, different accent placements.`;

export interface GenerateDocumentOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  prompt: string;
  logoUrl?: string;
  referenceImage?: string;
  extraInstructions?: string;
  model?: string;
  pexelsApiKey?: string;
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  onSection?: (section: Section3) => void;
  onImageUpdate?: (sectionId: string, html: string) => void;
  onDone?: (sections: Section3[]) => void;
  onError?: (error: Error) => void;
}

/**
 * Generate a multi-page document with streaming AI + image enrichment.
 */
export async function generateDocument(options: GenerateDocumentOptions): Promise<Section3[]> {
  const {
    prompt,
    logoUrl,
    referenceImage,
    extraInstructions,
    ...rest
  } = options;

  const extra = extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : "";
  // Truncate prompt to prevent token overflow (max ~15K chars ≈ 5K tokens)
  const safePrompt = prompt.length > 15_000 ? prompt.substring(0, 15_000) + "\n[...content truncated...]" : prompt;
  const logoInstruction = logoUrl
    ? `\nLOGO: Include this logo on the cover page and as a small header on other pages:\n<img src="${logoUrl}" alt="Logo" class="h-12 object-contain" />\nUse this exact <img> tag — do NOT invent a different logo.`
    : "";

  const content: any[] = [];

  if (referenceImage) {
    const converted = dataUrlToImagePart(referenceImage);
    if (converted) {
      content.push({ type: "image", ...converted });
    } else {
      content.push({ type: "image", image: referenceImage });
    }
    content.push({
      type: "text",
      text: `Create a professional document inspired by this reference image for: ${safePrompt}${logoInstruction}${extra}${DOCUMENT_PROMPT_SUFFIX}`,
    });
  } else {
    content.push({
      type: "text",
      text: `Create a professional document for: ${safePrompt}${logoInstruction}${extra}${DOCUMENT_PROMPT_SUFFIX}`,
    });
  }

  return streamGenerate({
    ...rest,
    systemPrompt: DOCUMENT_SYSTEM_PROMPT,
    userContent: content,
  });
}
