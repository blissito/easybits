import { streamText } from "ai";
import { enrichImages } from "./images/enrichImages";
import { sanitizeSemanticColors } from "./sanitizeColors";
import { resolveModel, currentDateLine } from "./streamCore";
import { buildThemePromptContext } from "./themes";

export const REFINE_SYSTEM = `You are an expert HTML/Tailwind CSS developer. You receive the current HTML of a landing page section and a user instruction.

RULES:
- Return ONLY the modified HTML — no full page, no <html>/<head>/<body> tags
- Use Tailwind CSS classes (CDN loaded)
- You may use inline styles for specific adjustments
- Images: use data-image-query="english search query" for new images
- Keep all text in its original language unless asked to translate
- Be creative — don't just make minimal changes, improve the design
- Return raw HTML only — no markdown fences, no explanations

COLOR SYSTEM — CRITICAL:
- Use semantic color classes: bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary, bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted, bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded colors: NO bg-gray-*, bg-black, bg-white, text-gray-*, text-black, text-white, etc.
- The ONLY exception: border-gray-200 or border-gray-700 for subtle dividers.
- ALL text MUST use: text-on-surface, text-on-surface-muted, text-on-primary, text-accent. Use text-primary ONLY on bg-surface/bg-surface-alt (it's the same hue as bg-primary — invisible on primary backgrounds).
- CONTRAST RULE: on bg-primary or bg-primary-dark → use ONLY text-on-primary. On bg-surface or bg-surface-alt → use text-on-surface, text-on-surface-muted, or text-primary. NEVER use text-primary on bg-primary — they are the SAME COLOR. NEVER put text-on-surface on bg-primary or text-on-primary on bg-surface.
- Use bg-accent, bg-secondary, text-accent, text-secondary for visual variety — not everything should be primary.

IMAGE OVERLAYS:
- When placing text over images, ALWAYS add a gradient overlay for readability
- Pattern: <div class="relative"><img .../><div class="absolute inset-0 bg-gradient-to-r from-primary/80 to-transparent"></div><div class="relative z-10">...text...</div></div>
- NEVER place text directly on images without an overlay

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

/**
 * Extract a text description from HTML for variant generation.
 * Instead of sending full HTML to the model, we send a content summary
 * so the model generates a completely new layout rather than tweaking colors.
 */
export function extractSectionDescription(html: string, label?: string): { content: string; layoutHint: string } {
  // Extract headings
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  // Extract paragraphs
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  // Extract button/CTA text
  const buttons = [...html.matchAll(/<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(t => t.length > 0 && t.length < 60);

  // Count items (cards, list items, grid children)
  const listItems = (html.match(/<li[\s>]/gi) || []).length;
  const gridMatch = html.match(/grid-cols-(\d)/);
  const gridCols = gridMatch ? parseInt(gridMatch[1]) : 0;

  // Detect layout patterns for negative prompt
  const layouts: string[] = [];
  if (html.includes("grid")) layouts.push("grid");
  if (html.includes("flex-col")) layouts.push("vertical-stack");
  if (html.includes("flex-row") || html.includes("md:flex-row")) layouts.push("horizontal-flex");
  if (html.includes("text-center") && !html.includes("text-left")) layouts.push("centered");
  if (gridCols) layouts.push(`${gridCols}-column-grid`);

  const content = [
    label ? `Section: ${label}` : "",
    headings.length ? `Headings: ${headings.join(" | ")}` : "",
    paragraphs.length ? `Text: ${paragraphs.slice(0, 3).join(" ")}` : "",
    buttons.length ? `CTAs: ${buttons.join(", ")}` : "",
    listItems > 0 ? `${listItems} list/card items` : "",
  ].filter(Boolean).join("\n");

  return { content, layoutHint: layouts.join(", ") };
}

export interface RefineOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var */
  anthropicApiKey?: string;
  /** OpenAI API key. If provided, uses GPT-4o-mini instead of Claude */
  openaiApiKey?: string;
  /** Current HTML of the section being refined */
  currentHtml: string;
  /** User instruction for refinement */
  instruction: string;
  /** Reference image (base64 data URI) for vision-based refinement */
  referenceImage?: string;
  /** When true, generates a completely new layout variant instead of refining */
  isVariant?: boolean;
  /** Custom system prompt (overrides default REFINE_SYSTEM) */
  systemPrompt?: string;
  /** Model ID (default: gpt-4o-mini/gpt-4o for OpenAI, claude-haiku/claude-sonnet for Anthropic) */
  model?: string;
  /** Pexels API key for image enrichment. Falls back to PEXELS_API_KEY env var */
  pexelsApiKey?: string;
  /** Called with temp DALL-E URL + query, returns permanent URL. Use to persist to S3/etc. */
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  /** Called with accumulated HTML as it streams */
  onChunk?: (html: string) => void;
  /** Called when refinement is complete with final enriched HTML */
  onDone?: (html: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Theme colors for AI context (deprecated — use themeName) */
  themeColors?: Record<string, string>;
  /** Theme name (e.g. "minimal", "noche") — tells the AI the design mood */
  themeName?: string;
  /** Brand kit info for AI context */
  brandKit?: {
    fonts?: { heading?: string; body?: string };
    mood?: string;
    logoUrl?: string;
  };
}

/**
 * Refine a landing page section with streaming AI.
 * Returns the final enriched HTML.
 */
export async function refineLanding(options: RefineOptions): Promise<string> {
  const {
    anthropicApiKey,
    openaiApiKey: _openaiApiKey,
    currentHtml,
    instruction,
    referenceImage,
    isVariant,
    systemPrompt = REFINE_SYSTEM,
    model: modelId,
    pexelsApiKey,
    persistImage,
    onChunk,
    onDone,
    onError,
    themeColors: _themeColors,
    themeName,
    brandKit,
  } = options;

  const openaiApiKey = _openaiApiKey || process.env.OPENAI_API_KEY;
  const useVision = !!referenceImage;
  const defaultOpenai = useVision ? "gpt-4o" : "gpt-4o-mini";
  const defaultAnthropic = useVision ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const model = await resolveModel({ openaiApiKey, anthropicApiKey, modelId, defaultOpenai, defaultAnthropic });

  // Build content (supports multimodal with reference image)
  const content: any[] = [];
  if (referenceImage) {
    content.push({ type: "image", image: referenceImage });
  }

  if (isVariant && !referenceImage) {
    // Variant mode: send description instead of HTML to force creative layout
    const { content: desc, layoutHint } = extractSectionDescription(currentHtml);
    content.push({
      type: "text",
      text: `Generate a COMPLETELY NEW section with the following content. Create an original, creative layout.\n\nContent:\n${desc}\n\n${layoutHint ? `DO NOT use these layout patterns (the current design already uses them): ${layoutHint}. Choose a radically different structure.` : ""}\n\nReturn ONLY the <section>...</section> HTML with Tailwind classes.`,
    });
  } else {
    content.push({
      type: "text",
      text: `Current HTML:\n${currentHtml}\n\nInstruction: ${instruction}\n\nReturn the updated HTML.`,
    });
  }

  // Inject theme + brand kit context
  let finalSystem = systemPrompt + currentDateLine();

  if (themeName && themeName !== "custom") {
    finalSystem += `\n\n## Active Theme\n${buildThemePromptContext(themeName)}`;
  }

  if (brandKit) {
    const bkLines: string[] = [];
    if (brandKit.fonts?.heading) bkLines.push(`- Heading font: use font-family: '${brandKit.fonts.heading}' via inline style on h1-h6`);
    if (brandKit.fonts?.body) bkLines.push(`- Body font: use font-family: '${brandKit.fonts.body}' via inline style on p, li, span`);
    if (brandKit.mood) bkLines.push(`- Design mood: ${brandKit.mood} — adapt spacing, imagery style, and visual weight to match`);
    if (brandKit.logoUrl) bkLines.push(`- Brand logo: include <img src="${brandKit.logoUrl}" alt="Logo" class="h-8 w-auto" /> in the navbar/hero area`);
    if (bkLines.length) finalSystem += `\n\n## Brand Kit\n${bkLines.join("\n")}`;
  }

  const result = streamText({
    model,
    system: finalSystem,
    messages: [{ role: "user", content }],
    ...(isVariant && !referenceImage ? { temperature: 1.2 } : {}),
  });

  try {
    let accumulated = "";

    for await (const chunk of result.textStream) {
      accumulated += chunk;
      onChunk?.(accumulated);
    }

    // Clean up markdown fences if present
    let html = accumulated.trim();
    if (html.startsWith("```")) {
      html = html.replace(/^```(?:html|xml)?\s*/, "").replace(/\s*```$/, "");
    }

    // Sanitize hardcoded colors to semantic classes
    html = sanitizeSemanticColors(html);

    // Enrich images (DALL-E if openaiApiKey, otherwise Pexels)
    html = await enrichImages(html, { pexelsApiKey, openaiApiKey, persistImage });

    onDone?.(html);
    return html;
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(err?.message || "Refine failed");
    onError?.(error);
    throw error;
  }
}
