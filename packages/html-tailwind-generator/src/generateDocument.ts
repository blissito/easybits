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

DESIGN:
- Professional, colorful designs: geometric decorations, gradients, accent colors
- Typography: use font weights (font-light to font-black), good hierarchy
- Tables: Tailwind table classes, alternating row colors, clean borders
- Decorative elements: colored sidebars, header bands, icon accents, SVG shapes
- First page MUST be a cover/title page with impactful design
- Use page-appropriate content density — don't cram too much on one page
- For numerical data: styled tables, colored bars, progress elements

COLOR SYSTEM — use semantic classes for decorative elements:
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- Use semantic colors freely for full-page backgrounds, headers, sidebars, decorative bars, table headers, accents
- Cover pages should use bold full-bleed backgrounds (bg-primary, gradients)
- CONTRAST RULE: on bg-primary → text-on-primary. On white/bg-surface → text-on-surface or text-primary
- Gradients: from-primary to-primary-dark

IMAGES:
- EVERY image MUST use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image
- For avatar-like elements, use colored divs with initials instead of img tags

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

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
