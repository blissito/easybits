import { generateObject, streamText } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  streamGenerate,
  dataUrlToImagePart,
  resolveModel,
  currentDateLine,
  extractJsonObjects,
  addLoadingPlaceholders,
  addSvgLoadingPlaceholders,
  enrichSectionImages,
  enrichSectionSvgCharts,
  enrichSectionIconSlots,
} from "./streamCore";
import { sanitizeSemanticColors } from "./sanitizeColors";
import type { Section3 } from "./types";
import type { DesignDirection } from "./directions";
import { GAMMA_LAYOUTS } from "./directions";

/**
 * Append optional direction fields (audience, voice, density, presets, etc.)
 * to a base direction-instruction block. Keeps backward-compatible with old
 * callers that only set name/fonts/colors/mood/layoutHint.
 */
function appendDirectionExtras(direction: DesignDirection): string {
  const lines: string[] = [];
  if (direction.audience) lines.push(`Audience: ${direction.audience}`);
  if (direction.voice) lines.push(`Voice / tone: ${direction.voice}`);
  if (direction.typographyScale) {
    const s = direction.typographyScale;
    const parts: string[] = [];
    if (s.h1) parts.push(`h1=${s.h1}`);
    if (s.h2) parts.push(`h2=${s.h2}`);
    if (s.h3) parts.push(`h3=${s.h3}`);
    if (s.body) parts.push(`body=${s.body}`);
    if (s.label) parts.push(`label=${s.label}`);
    if (s.caption) parts.push(`caption=${s.caption}`);
    if (parts.length > 0) {
      lines.push(`TYPOGRAPHY SCALE (mandatory — use these EXACT sizes via inline style="font-size: Xpx", NO improvisation): ${parts.join(", ")}`);
    }
  }
  if (direction.density) lines.push(`Density: ${direction.density}`);
  if (direction.borderRadius) lines.push(`Border radius: ${direction.borderRadius}`);
  if (direction.shadows) lines.push(`Shadows: ${direction.shadows}`);
  if (direction.imageryStyle) lines.push(`Imagery style: ${direction.imageryStyle}`);
  if (direction.contentDiscipline) lines.push(`Content discipline: ${direction.contentDiscipline}`);
  if (direction.referenceBrands && direction.referenceBrands.length > 0)
    lines.push(`Reference brands (take design cues from): ${direction.referenceBrands.join(", ")}`);
  if (direction.layoutPreset && GAMMA_LAYOUTS[direction.layoutPreset])
    lines.push(`Layout preset (FOLLOW THIS RECIPE EXACTLY): "${direction.layoutPreset}" — ${GAMMA_LAYOUTS[direction.layoutPreset]}`);
  if (direction.customInstructions) lines.push(`Custom instructions: ${direction.customInstructions}`);
  return lines.length > 0 ? "\n" + lines.join("\n") : "";
}

export type PageFormat = "letter" | "web";

export const PAGE_FORMAT_CONFIG = {
  letter: {
    container: "w-[8.5in] h-[11in]",
    bodyText: "text-sm or text-base (10-11px)",
    maxColumns: 2,
    heightMode: "fixed at 11in",
    description: 'letter-sized (8.5" × 11") document pages',
  },
  web: {
    container: "w-[1280px] min-h-[800px]",
    bodyText: "text-base or text-lg (16-18px)",
    maxColumns: 1,
    heightMode: "flexible, no max height",
    description: "web-optimized document sections",
  },
} as const;

export function getDocumentSystemPrompt(format: PageFormat = "letter"): string {
  const cfg = PAGE_FORMAT_CONFIG[format];
  const isWeb = format === "web";

  return `You are a professional document designer who creates stunning ${cfg.description} using HTML + Tailwind CSS.

RULES:
- Each page is a <section> element${isWeb ? " optimized for web viewing" : " sized for letter paper"}
- Page structure: <section class="${cfg.container} relative overflow-hidden flex flex-col">
- ${isWeb ? "Each section has flexible height — content determines the height. Use min-h-[800px] but allow natural growth." : "The section is EXACTLY 11in tall — content MUST fit, never exceed. Use flex flex-col so children can use flex-1."}
- The section itself has NO padding — backgrounds, gradients, and decorative elements go edge-to-edge
- Use slot layout: shrink-0 for header/footer bands, flex-1 overflow-hidden for main content area
- For text content, use an inner wrapper: <div class="flex-1 overflow-hidden px-[0.75in] py-[0.5in]">...content...</div>
- Footer elements (page numbers, decorative bars, contact info) MUST be direct children of <section> with shrink-0 and w-full — NEVER inside the padded content wrapper. This ensures footer backgrounds extend edge-to-edge
- Cover pages and decorative sections can use full-bleed backgrounds (bg-primary, gradients, images that fill the entire page)
- Content MUST NOT overflow page boundaries — be conservative with spacing
- Use Tailwind CDN classes ONLY (no custom CSS, no @apply, no @import)
- NO JavaScript, only HTML+Tailwind
- All text content in Spanish unless the prompt specifies otherwise
- Use real content from the source material, not Lorem ipsum
- NOT responsive — fixed ${isWeb ? "width" : "letter size"}, no breakpoints needed
- Sections can have ANY background — full-bleed color, gradients, or white. Not limited to white paper.

STRICT PROHIBITIONS:
1. **NO EMOJI** — Never use emoji characters (🚀❌✅📊 etc.). Instead use inline SVG icons or colored divs. For bullet decorators use small colored circles (<span class="w-2 h-2 rounded-full bg-primary inline-block"></span>) or simple SVG.
2. **NO Chart.js / NO JavaScript** — Never reference Chart.js, canvas, or any JS library. For data visualization use pure CSS: progress bars (div with percentage width + bg-primary), horizontal bars, styled tables with colored cells. Never use <canvas> or <script>.
3. **NO buttons or CTAs** — This is a ${isWeb ? "document" : "print document"}, not a ${isWeb ? "landing page" : "web page"}. No "Contactar", "Ver más", "Comprar" buttons. Use text with contact info instead.
4. **CONTRAST IS MANDATORY** — Dark/colored backgrounds (bg-primary, bg-primary-dark, bg-secondary, dark gradients) MUST use text-white or text-on-primary. Light backgrounds (white, bg-surface, bg-surface-alt) MUST use text-gray-900 or text-on-surface. NEVER use dark text on dark backgrounds or light text on light backgrounds.
5. **Max 2 font weights per page** — Pick 2 (e.g. font-semibold + font-normal, or font-bold + font-light). Don't mix 4-5 weights.
6. **Generous whitespace** — Don't fill every centimeter. Leave breathing room. Use py-8, py-12, gap-6, gap-8 liberally. Less content per page = more professional.

LAYOUT OVERFLOW PREVENTION — CRITICAL:
- Max ${cfg.maxColumns} column${cfg.maxColumns === 1 ? "" : "s"} side by side${cfg.maxColumns === 2 ? " — each with w-1/2" : ""}. NEVER use ${cfg.maxColumns + 1}+ columns.
- Decorative sidebars: max w-16 (4rem). NEVER use w-[2.5in] or wider sidebars — they steal too much space.
- Stats/metric grids: max 3 items per row (grid-cols-3). Use gap-4 or gap-6.
- Tables: max 4 columns, use text-xs or text-sm for cell text, px-3 py-2 cell padding.
- Images: always w-full or max-w-[50%] — never fixed pixel widths.
- Text: never use text-6xl or larger except for cover page title. Body text: ${cfg.bodyText}.
- NEVER use absolute positioning that could overflow — prefer flex/grid layouts.
- Decorative shapes with absolute positioning MUST stay fully inside the page. Use overflow-hidden on parent AND keep coordinates positive (no negative right/left values).
- Large decorative text (text-[200px], text-[10rem] etc.) MUST have opacity-5 or lower AND overflow-hidden on its container. These giant texts frequently overflow — be extra careful.
- NEVER place elements beyond the right edge — all content and decorations must fit within ${isWeb ? "1280px" : "8.5in"} width.

DESIGN — ADAPT to the document type. Read the prompt carefully and match the visual style:

GENERAL PRINCIPLES (apply to ALL documents):
- First page is ALWAYS a stunning cover/title page with impactful design
- Typography: strong hierarchy with just 2 weights, clear headings vs body
- Each page visually distinct — different layouts, accent placements
- Use the full page creatively — backgrounds, sidebars, geometric shapes
- Professional and polished, never generic or template-looking
- Icons: use simple inline SVG (12-20px) for visual accents. Keep SVGs minimal (single path, no complex illustrations)

ADAPT YOUR STYLE to what the user is creating:
- Reports/Data: structured grids, tables with alternating rows (bg-surface-alt), progress bars, stat cards, clean data hierarchy
- Brochures/Marketing: bold hero images, large headlines, feature grids, testimonial-style quotes, visual storytelling
- Catalogs/Products: product cards with images, specs grids, price highlights, category headers with full-bleed color
- Invitations/Events: centered dramatic typography, decorative borders, elegant spacing, date/location prominently styled
- Proposals/Pitches: problem→solution flow, metric highlights, team/about sections, pricing tables
- CVs/Resumes: clean sidebar layouts, skill bars, timeline for experience, contact info header
- Creative/General: mix techniques — bento grids, full-bleed images, overlapping elements, bold color blocking

VISUAL TECHNIQUES available to you:
- Full-bleed colored pages (bg-primary, gradients)
- Geometric accent shapes (CSS divs with clip-path or rotation)
- Asymmetric layouts (grid with unequal columns)
- Large stat numbers as visual anchors (text-5xl font-black)
- Header/footer bands with contrasting color
- Sidebar accents (thin, max w-16)
- Image + text compositions
- Bento-grid mixing content blocks of different sizes
- Tables: alternating row colors, clean borders, generous cell padding (px-4 py-3)
- For numerical data: CSS progress bars, styled tables with colored cells, large stat numbers — NEVER canvas/charts

CSS PROGRESS BARS — use this pattern for data visualization:
<div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-primary h-3 rounded-full" style="width: 75%"></div></div>

COLOR SYSTEM — use semantic classes:
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- Cover pages should use bold full-bleed backgrounds (bg-primary, gradients from-primary to-primary-dark)
- CONTRAST: bg-primary/bg-primary-dark/bg-secondary → text-white or text-on-primary. White/bg-surface → text-gray-900 or text-on-surface

IMAGES — USE GENEROUSLY:
- EVERY image MUST use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image
- For avatar-like elements, use colored divs with initials instead of img tags
- Include at LEAST 3-5 images across the document — hero images, section illustrations, backgrounds, product photos
- Each data-image-query should be a UNIQUE, specific search query in English (e.g. "modern office workspace aerial view", "team brainstorming whiteboard", "abstract blue technology network")
- Use images to break up text-heavy pages and add visual interest

ICONS — use data-icon-query for professional icons:
- <span data-icon-query="icon-name" class="inline-block w-5 h-5 text-primary"></span>
- Use common Lucide icon names in English: star, check, arrow-right, heart, zap, shield, users, mail, phone, calendar, clock, map-pin, briefcase, trending-up, award, target, layers, globe, etc.
- Use in: feature lists, stat cards, CTAs, list items, contact info, section headers
- Sizes: w-4 h-4 (small), w-5 h-5 (default), w-8 h-8 (large). Color inherits from text-* class.
- NEVER draw SVG paths manually — ALWAYS use data-icon-query instead
- The system auto-replaces data-icon-query with real SVG icons from Iconify

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
<section class="${cfg.container} relative overflow-hidden flex flex-col bg-white">
  <div class="absolute left-0 top-0 w-2 h-full bg-primary"></div>
  <div class="flex-1 overflow-hidden flex flex-col justify-center px-[1in]">
    <div class="text-sm font-normal text-primary mb-4">Marzo 2026 · Versión 1.0</div>
    <h1 class="text-5xl font-bold text-gray-900 leading-tight">Reporte<br/>Trimestral</h1>
    <div class="w-16 h-1 bg-primary mt-6 mb-4"></div>
    <p class="text-lg font-normal text-gray-500">Resultados y análisis del primer trimestre</p>
  </div>
</section>

EXAMPLE — Marketing/brochure page (bold, visual):
<section class="${cfg.container} relative overflow-hidden flex flex-col bg-primary">
  <div class="flex flex-1 overflow-hidden">
    <div class="${isWeb ? "flex-1" : "w-1/2"} flex flex-col justify-center px-[0.75in]">
      <span class="text-sm font-normal text-on-primary opacity-70 uppercase tracking-widest mb-3">Solución Premium</span>
      <h2 class="text-4xl font-bold text-on-primary leading-tight mb-6">Transforma tu negocio digital</h2>
      <p class="text-base font-normal text-on-primary opacity-80 mb-8">Herramientas inteligentes que simplifican la gestión de tus activos digitales.</p>
      <div class="flex gap-6">
        <div><div class="text-3xl font-bold text-accent">98%</div><div class="text-xs text-on-primary opacity-70">Satisfacción</div></div>
        <div><div class="text-3xl font-bold text-accent">2.4K</div><div class="text-xs text-on-primary opacity-70">Empresas</div></div>
      </div>
    </div>
    <div class="${isWeb ? "flex-1" : "w-1/2"} relative">
      <img data-image-query="modern office team collaboration technology" alt="Team working" class="absolute inset-0 w-full h-full object-cover" />
    </div>
  </div>
</section>

EXAMPLE — Catalog/product grid page:
<section class="${cfg.container} relative overflow-hidden flex flex-col bg-surface">
  <div class="shrink-0 h-1 bg-primary w-full"></div>
  <div class="flex-1 overflow-hidden px-[0.75in] py-[0.5in]">
    <div class="flex justify-between items-baseline mb-6">
      <h2 class="text-2xl font-bold text-on-surface">Colección Primavera</h2>
      <span class="text-xs font-normal text-on-surface-muted uppercase tracking-wider">Página 3 de 8</span>
    </div>
    <div class="grid grid-cols-2 gap-6">
      <div class="bg-surface-alt rounded-xl overflow-hidden">
        <img data-image-query="minimalist product on white background" alt="Product" class="w-full h-48 object-cover" />
        <div class="p-4"><h3 class="font-bold text-on-surface text-sm">Producto Alpha</h3><p class="text-xs text-on-surface-muted mt-1">Diseño ergonómico premium</p><div class="text-lg font-bold text-primary mt-2">$2,490</div></div>
      </div>
      <div class="bg-surface-alt rounded-xl overflow-hidden">
        <img data-image-query="elegant product photography studio" alt="Product" class="w-full h-48 object-cover" />
        <div class="p-4"><h3 class="font-bold text-on-surface text-sm">Producto Beta</h3><p class="text-xs text-on-surface-muted mt-1">Tecnología de vanguardia</p><div class="text-lg font-bold text-primary mt-2">$3,190</div></div>
      </div>
    </div>
  </div>
  <!-- Footer: direct child of section, shrink-0, full width -->
  <div class="shrink-0 w-full bg-surface-alt px-[0.75in] py-3 flex justify-between items-center">
    <span class="text-xs text-on-surface-muted">Colección Primavera 2026</span>
    <span class="text-xs text-on-surface-muted">Página 3 de 8</span>
  </div>
</section>

EXAMPLE — Content page with table + progress bars:
<section class="${cfg.container} relative overflow-hidden flex flex-col bg-white">
  <div class="shrink-0 h-1.5 bg-primary w-full"></div>
  <div class="flex-1 overflow-hidden px-[0.75in] py-[0.5in]">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Métricas de Rendimiento</h2>
    <p class="text-sm font-normal text-gray-500 mb-8">Indicadores clave del periodo enero—marzo</p>
    <table class="w-full text-sm mb-10">
      <thead><tr class="bg-primary text-white"><th class="px-4 py-3 text-left font-semibold">Indicador</th><th class="px-4 py-3 text-left font-semibold">Valor</th><th class="px-4 py-3 text-left font-semibold">Meta</th></tr></thead>
      <tbody>
        <tr class="bg-surface-alt"><td class="px-4 py-3 text-gray-900">Ingresos</td><td class="px-4 py-3 text-gray-900">$1.2M</td><td class="px-4 py-3 text-gray-900">$1.5M</td></tr>
        <tr><td class="px-4 py-3 text-gray-900">Clientes nuevos</td><td class="px-4 py-3 text-gray-900">340</td><td class="px-4 py-3 text-gray-900">300</td></tr>
        <tr class="bg-surface-alt"><td class="px-4 py-3 text-gray-900">Retención</td><td class="px-4 py-3 text-gray-900">92%</td><td class="px-4 py-3 text-gray-900">${"90%"}</td></tr>
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
}

export const DOCUMENT_SYSTEM_PROMPT = getDocumentSystemPrompt("letter");

export function getDocumentPromptSuffix(format: PageFormat = "letter"): string {
  const cfg = PAGE_FORMAT_CONFIG[format];
  const isWeb = format === "web";
  return `

OUTPUT FORMAT: NDJSON — one JSON object per line, NO wrapper array, NO markdown fences.
Each line: {"label": "Page Title", "html": "<section class='${cfg.container} relative overflow-hidden flex flex-col'>...</section>"}

Generate 3-8 pages depending on content length. First page = cover/title page.
${isWeb ? "Each section should have comfortable spacing for web reading." : "Each page must fit within letter size (8.5\" × 11\"). Be conservative with spacing."}
Make each page visually distinct — different layouts, different accent placements.
IMPORTANT: Adapt your design style to match the type of document — not everything is a report. Brochures should feel bold and visual, catalogs should showcase products, invitations should feel elegant, etc.`;
}

export const DOCUMENT_PROMPT_SUFFIX = getDocumentPromptSuffix("letter");

export interface GenerateDocumentOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  prompt: string;
  logoUrl?: string;
  referenceImage?: string;
  extraInstructions?: string;
  model?: string | import("ai").LanguageModel;
  pexelsApiKey?: string;
  /** Design direction — injects Google Fonts + hex colors into the prompt */
  direction?: DesignDirection;
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  onSection?: (section: Section3) => void;
  onImageUpdate?: (sectionId: string, html: string) => void;
  onRawChunk?: (buffer: string, completedCount: number) => void;
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
    direction,
    ...rest
  } = options;

  const extra = extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : "";

  // Build direction style instructions if provided
  let directionInstruction = "";
  if (direction) {
    const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(direction.headingFont).replace(/%20/g, "+")}:wght@400;700;900&family=${encodeURIComponent(direction.bodyFont).replace(/%20/g, "+")}:wght@400;500;600&display=swap`;
    directionInstruction = `
DESIGN DIRECTION: "${direction.name}" — ${direction.tagline}
TYPOGRAPHY: Use these Google Fonts via <link href="${fontsUrl}" rel="stylesheet"> on the first page.
- Headings: font-family: '${direction.headingFont}', sans-serif (via inline style)
- Body: font-family: '${direction.bodyFont}', sans-serif (via inline style)
COLORS — use ONLY semantic Tailwind classes (the editor injects CSS variables that resolve these):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded hex colors like bg-[#xxx] or text-[#xxx] — always use semantic classes
- The palette is: primary=${direction.colors.primary}, accent=${direction.colors.accent}, surface=${direction.colors.surface}
Mood: ${direction.mood}
Layout approach: ${direction.layoutHint}${appendDirectionExtras(direction)}
IMPORTANT: Apply inline style="font-family: '${direction.headingFont}'" on ALL heading elements and style="font-family: '${direction.bodyFont}'" on ALL body text elements. Include the Google Fonts <link> tag inside the FIRST <section> only.`;
  }
  // Truncate prompt to prevent token overflow (max ~15K chars ≈ 5K tokens)
  const safePrompt = prompt.length > 15_000 ? prompt.substring(0, 15_000) + "\n[...content truncated...]" : prompt;
  const logoInstruction = logoUrl
    ? `\nLOGO: Include this logo on the cover page and as a small header on other pages:\n<img src="${logoUrl}" alt="Logo" class="h-12 object-contain" />\nUse this exact <img> tag with this exact src URL — do NOT invent a different URL or modify it.`
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
      text: `Create a professional document inspired by this reference image for: ${safePrompt}${logoInstruction}${directionInstruction}${extra}${DOCUMENT_PROMPT_SUFFIX}`,
    });
  } else {
    content.push({
      type: "text",
      text: `Create a professional document for: ${safePrompt}${logoInstruction}${directionInstruction}${extra}${DOCUMENT_PROMPT_SUFFIX}`,
    });
  }

  return streamGenerate({
    ...rest,
    systemPrompt: DOCUMENT_SYSTEM_PROMPT,
    userContent: content,
  });
}

// ---------------------------------------------------------------------------
// Parallel Document Generation
// ---------------------------------------------------------------------------

const DocumentOutlineSchema = z.object({
  pages: z.array(z.object({
    pageNumber: z.number(),
    label: z.string().describe("Page title for sidebar"),
    type: z.enum(["cover", "content", "data", "visual", "closing"]),
    layoutPreset: z.enum([
      "cover",
      "section-divider",
      "agenda",
      "big-statement",
      "one-big-stat",
      "stat-grid",
      "two-column",
      "three-column",
      "image-full-bleed",
      "image-text-split",
      "bento-grid",
      "card-grid",
      "comparison-table",
      "timeline-vertical",
      "process-steps",
      "quote",
      "closing-cta",
    ]).describe("Premium layout preset (Gamma-style recipe). Pick the BEST FIT for this page's content. The renderer will follow the recipe exactly."),
    contentBrief: z.string().describe("2-4 sentences describing exactly what goes on this page"),
    keyElements: z.array(z.string()).describe("Specific elements: stats grid, table, hero image, timeline, etc."),
    backgroundStyle: z.enum(["white", "primary", "gradient", "surface-alt", "image"]),
    continuesFrom: z.string().optional().describe("How this page relates to the previous one"),
  })),
});

export type DocumentOutline = z.infer<typeof DocumentOutlineSchema>;

export interface GenerateDocumentParallelOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  prompt: string;
  logoUrl?: string;
  referenceImage?: string;
  /** Per-page reference images (e.g. rendered from PDF pages). Index matches page order. */
  referencePages?: string[];
  extraInstructions?: string;
  /** Model for page generation (quality model) */
  model?: string | import("ai").LanguageModel;
  /** Model for outline generation (fast model) */
  outlineModel?: string | import("ai").LanguageModel;
  pexelsApiKey?: string;
  direction?: DesignDirection;
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  pageCount?: number;
  skipCover?: boolean;
  pageFormat?: PageFormat;
  onOutline?: (outline: DocumentOutline) => void;
  onPageChunk?: (pageIndex: number, partialHtml: string) => void;
  onPageComplete?: (pageIndex: number, section: Section3) => void;
  onImageUpdate?: (sectionId: string, html: string) => void;
  onDone?: (sections: Section3[]) => void;
  onError?: (error: Error) => void;
  /** Called with accumulated token usage from outline + all pages */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

function buildDirectionInstruction(direction: DesignDirection): string {
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(direction.headingFont).replace(/%20/g, "+")}:wght@400;700;900&family=${encodeURIComponent(direction.bodyFont).replace(/%20/g, "+")}:wght@400;500;600&display=swap`;
  return `
DESIGN DIRECTION: "${direction.name}" — ${direction.tagline}
TYPOGRAPHY: Use these Google Fonts via <link href="${fontsUrl}" rel="stylesheet"> on the first page.
- Headings: font-family: '${direction.headingFont}', sans-serif (via inline style)
- Body: font-family: '${direction.bodyFont}', sans-serif (via inline style)
COLORS — use ONLY semantic Tailwind classes (the editor injects CSS variables that resolve these):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded hex colors like bg-[#xxx] or text-[#xxx] — always use semantic classes
- The palette is: primary=${direction.colors.primary}, accent=${direction.colors.accent}, surface=${direction.colors.surface}
Mood: ${direction.mood}
Layout approach: ${direction.layoutHint}${appendDirectionExtras(direction)}
IMPORTANT: Apply inline style="font-family: '${direction.headingFont}'" on ALL heading elements and style="font-family: '${direction.bodyFont}'" on ALL body text elements. Include the Google Fonts <link> tag inside the FIRST <section> only.`;
}

/** Extract partial HTML from a raw JSON buffer (same pattern as onRawChunk) */
function extractPartialHtml(buffer: string): string | null {
  const htmlMatch = buffer.match(/"html"\s*:\s*"([\s\S]*)/);
  if (!htmlMatch) return null;
  let partial = htmlMatch[1]
    .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (partial.endsWith('\\')) partial = partial.slice(0, -1);
  const lastQuote = partial.lastIndexOf('"');
  if (lastQuote > 0) partial = partial.slice(0, lastQuote);
  if (/<section/i.test(partial) && !/<\/section>/i.test(partial)) {
    partial += '</section>';
  }
  return partial.length > 20 ? partial : null;
}

export async function generateDocumentParallel(options: GenerateDocumentParallelOptions): Promise<Section3[]> {
  const {
    anthropicApiKey,
    openaiApiKey: _openaiApiKey,
    prompt,
    logoUrl,
    referenceImage,
    referencePages,
    extraInstructions,
    model: pageModelId,
    outlineModel: outlineModelId,
    pexelsApiKey,
    direction,
    persistImage,
    pageCount,
    skipCover,
    pageFormat = "letter",
    onOutline,
    onPageChunk,
    onPageComplete,
    onImageUpdate,
    onDone,
    onError,
    onUsage,
  } = options;

  const openaiApiKey = _openaiApiKey || process.env.OPENAI_API_KEY;

  try {
    // --- Phase 1: Generate outline ---
    const outlineModel = await resolveModel({
      openaiApiKey,
      anthropicApiKey,
      modelId: outlineModelId,
      defaultOpenai: "gpt-4.1-mini",
      defaultAnthropic: "claude-haiku-4-5-20251001",
    });

    const safePrompt = prompt.length > 15_000 ? prompt.substring(0, 15_000) + "\n[...content truncated...]" : prompt;
    const extra = extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : "";
    const pageCountHint = skipCover
      ? `Generate exactly ${Math.max(1, (pageCount || 5) - 1)} content pages (NO cover — it already exists).`
      : pageCount
        ? `Generate exactly ${pageCount} pages including a cover page.`
        : "Generate 3-8 pages including a cover page.";

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const { object: rawOutline, usage: outlineUsage } = await generateObject({
      model: outlineModel,
      schema: DocumentOutlineSchema,
      prompt: `You are planning a professional document. Create a detailed page-by-page outline.

DOCUMENT BRIEF: ${safePrompt}${extra}

RULES:
- ${pageCountHint}
${skipCover ? "- CRITICAL: Do NOT include a cover/title page. The cover already exists. Start with page type 'content', 'data', or 'visual'. NEVER use type 'cover'." : "- First page is ALWAYS a stunning cover/title page."}
- Distribute content EVENLY — no page should be overloaded
- Each page must use a DISTINCT layoutPreset (do not repeat the same preset back-to-back). Pick the BEST FIT per page from the enum: cover (only if skipCover=false), section-divider, agenda, big-statement, one-big-stat, stat-grid, two-column, three-column, image-full-bleed, image-text-split, bento-grid, card-grid, comparison-table, timeline-vertical, process-steps, quote, closing-cta
- A premium document varies rhythm: at least one stat-heavy preset, one image-led preset, one quote/big-statement break, one closing-cta or section-divider
- Narrative flows naturally: ${skipCover ? "introduction → detail → data → closing" : "cover → introduction → detail → data → closing"}
- contentBrief must be detailed enough that a separate AI can generate the page independently
- keyElements must list specific visual elements (not vague descriptions)
- Vary backgroundStyle across pages — not all white
- If source content is provided, assign specific portions to each page in the contentBrief
${direction ? `- Design mood: ${direction.mood}, layout approach: ${direction.layoutHint}` : ""}`,
    });

    totalInputTokens += outlineUsage?.inputTokens || 0;
    totalOutputTokens += outlineUsage?.outputTokens || 0;

    // Filter out any cover pages if skipCover (AI sometimes ignores instructions)
    const outline: DocumentOutline = skipCover
      ? { pages: rawOutline.pages.filter(p => p.type !== "cover").map((p, i) => ({ ...p, pageNumber: i + 1 })) }
      : rawOutline;

    onOutline?.(outline);

    // --- Phase 2: Generate pages in parallel ---
    const directionInstruction = direction ? buildDirectionInstruction(direction) : "";
    const logoInstruction = logoUrl
      ? `\nLOGO: Include this logo on the cover page and as a small header on other pages:\n<img src="${logoUrl}" alt="Logo" class="h-12 object-contain" />\nUse this exact <img> tag with this exact src URL.`
      : "";

    const outlineJson = JSON.stringify(outline.pages, null, 2);

    const pageModel = await resolveModel({
      openaiApiKey,
      anthropicApiKey,
      modelId: pageModelId,
      defaultOpenai: "gpt-4o",
      defaultAnthropic: "claude-sonnet-4-6",
    });

    async function generateSinglePage(
      page: DocumentOutline["pages"][number],
      retryCount = 0
    ): Promise<Section3> {
      const pageIdx = page.pageNumber - 1;
      const isCover = page.type === "cover";

      const userContent: any[] = [];

      // Per-page reference image from PDF (takes priority)
      const pageRef = referencePages?.[pageIdx];
      if (pageRef) {
        const converted = dataUrlToImagePart(pageRef);
        if (converted) {
          userContent.push({ type: "image", ...converted });
        } else {
          userContent.push({ type: "image", image: pageRef });
        }
      } else if (referenceImage && (isCover || page.type === "visual")) {
        // Fallback: single reference image for cover/visual pages
        const converted = dataUrlToImagePart(referenceImage);
        if (converted) {
          userContent.push({ type: "image", ...converted });
        } else {
          userContent.push({ type: "image", image: referenceImage });
        }
      }

      const hasRefImage = !!pageRef || !!(referenceImage && (isCover || page.type === "visual"));
      userContent.push({
        type: "text",
        text: `You are generating PAGE ${page.pageNumber} of ${outline.pages.length} for a professional document.
${hasRefImage ? "\nREFERENCE IMAGE: The attached image shows the design to replicate. Match its layout, typography style, and visual structure as closely as possible while using the semantic color system and content from the brief." : ""}

FULL DOCUMENT OUTLINE (for context — you are generating ONLY page ${page.pageNumber}):
${outlineJson}

YOUR PAGE ASSIGNMENT:
- Label: ${page.label}
- Type: ${page.type}
- Layout preset (FOLLOW THIS RECIPE EXACTLY): "${page.layoutPreset}" — ${GAMMA_LAYOUTS[page.layoutPreset]}
- Background: ${page.backgroundStyle}
- Content: ${page.contentBrief}
- Key elements: ${page.keyElements.join(", ")}
${page.continuesFrom ? `- Continues from: ${page.continuesFrom}` : ""}
${isCover ? logoInstruction : logoUrl ? `\nSmall logo header: <img src="${logoUrl}" alt="Logo" class="h-8 object-contain" />` : ""}
${directionInstruction}

OUTPUT: A single JSON object on ONE line, no markdown fences:
{"label": "${page.label}", "html": "<section class='${PAGE_FORMAT_CONFIG[pageFormat].container} relative overflow-hidden flex flex-col'>...</section>"}`,
      });

      try {
        const result = streamText({
          model: pageModel,
          system: getDocumentSystemPrompt(pageFormat || "letter") + currentDateLine(),
          messages: [{ role: "user", content: userContent }],
        });

        let buffer = "";
        let chunkCount = 0;
        for await (const chunk of result.textStream) {
          buffer += chunk;
          chunkCount++;
          if (chunkCount % 5 === 0) {
            const partial = extractPartialHtml(buffer);
            if (partial) onPageChunk?.(pageIdx, partial);
          }
        }

        // Accumulate token usage
        const pageUsage = await result.usage;
        totalInputTokens += pageUsage?.inputTokens || 0;
        totalOutputTokens += pageUsage?.outputTokens || 0;

        // Final partial before parse
        const finalPartial = extractPartialHtml(buffer);
        if (finalPartial) onPageChunk?.(pageIdx, finalPartial);

        // Parse the JSON object
        let cleaned = buffer.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }
        const [objects] = extractJsonObjects(cleaned);
        const obj = objects[0];
        if (!obj?.html) throw new Error(`No valid HTML output for page ${page.pageNumber}`);

        const section: Section3 = {
          id: nanoid(8),
          order: pageIdx,
          html: sanitizeSemanticColors(addSvgLoadingPlaceholders(addLoadingPlaceholders(obj.html))),
          label: obj.label || page.label,
        };

        onPageComplete?.(pageIdx, section);
        return section;
      } catch (err) {
        if (retryCount < 1) {
          console.warn(`Page ${page.pageNumber} failed, retrying:`, (err as Error).message);
          return generateSinglePage(page, retryCount + 1);
        }
        // Return error placeholder
        const section: Section3 = {
          id: nanoid(8),
          order: pageIdx,
          html: `<section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col bg-gray-50 items-center justify-center"><div class="text-center text-gray-400"><p class="text-lg font-semibold">Error generando página</p><p class="text-sm mt-2">${(err as Error).message?.slice(0, 100) || "Error desconocido"}</p></div></section>`,
          label: page.label,
        };
        onPageComplete?.(pageIdx, section);
        return section;
      }
    }

    const results = await Promise.allSettled(
      outline.pages.map((page) => generateSinglePage(page))
    );

    const sections: Section3[] = results
      .map((r) => r.status === "fulfilled" ? r.value : null)
      .filter((s): s is Section3 => s !== null)
      .sort((a, b) => a.order - b.order);

    // --- Phase 3: Image enrichment (sequential to respect Pexels rate limits) ---
    for (const section of sections) {
      await enrichSectionImages(section, {
        pexelsApiKey,
        openaiApiKey,
        persistImage,
        onImageUpdate,
      });
      await enrichSectionSvgCharts(section, {
        anthropicApiKey,
        onImageUpdate,
      });
      await enrichSectionIconSlots(section, { onImageUpdate });
    }

    // Final fallback for images without src
    for (const section of sections) {
      const before = section.html;
      section.html = section.html.replace(
        /<img\s(?![^>]*\bsrc=)([^>]*?)>/gi,
        (_match, attrs) => {
          const altMatch = attrs.match(/alt="([^"]*?)"/);
          const query = altMatch?.[1] || "image";
          return `<img src="https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(query.slice(0, 30))}" ${attrs}>`;
        }
      );
      if (section.html !== before) {
        onImageUpdate?.(section.id, section.html);
      }
    }

    onUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
    onDone?.(sections);
    return sections;
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(err?.message || "Parallel generation failed");
    onError?.(error);
    throw error;
  }
}
