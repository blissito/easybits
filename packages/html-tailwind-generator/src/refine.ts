import { streamText } from "ai";
import { enrichImages } from "./images/enrichImages";
import { sanitizeSemanticColors } from "./sanitizeColors";
import { resolveModel } from "./streamCore";

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

  const result = streamText({
    model,
    system: systemPrompt,
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
