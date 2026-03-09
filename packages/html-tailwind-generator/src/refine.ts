import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { enrichImages } from "./images/enrichImages";

function resolveModel(opts: { openaiApiKey?: string; anthropicApiKey?: string; modelId?: string; defaultOpenai: string; defaultAnthropic: string }) {
  const openaiKey = opts.openaiApiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const { createOpenAI } = require("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(opts.modelId || opts.defaultOpenai);
  }
  const anthropic = opts.anthropicApiKey
    ? createAnthropic({ apiKey: opts.anthropicApiKey })
    : createAnthropic();
  return anthropic(opts.modelId || opts.defaultAnthropic);
}

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
- CONTRAST RULE: on bg-primary/bg-primary-dark → text-on-primary. On bg-surface/bg-surface-alt → text-on-surface/text-on-surface-muted. Never mismatch.

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

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
  /** Custom system prompt (overrides default REFINE_SYSTEM) */
  systemPrompt?: string;
  /** Model ID (default: gpt-4o-mini/gpt-4o for OpenAI, claude-haiku/claude-sonnet for Anthropic) */
  model?: string;
  /** Pexels API key for image enrichment. Falls back to PEXELS_API_KEY env var */
  pexelsApiKey?: string;
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
    systemPrompt = REFINE_SYSTEM,
    model: modelId,
    pexelsApiKey,
    onChunk,
    onDone,
    onError,
  } = options;

  const openaiApiKey = _openaiApiKey || process.env.OPENAI_API_KEY;
  const defaultOpenai = referenceImage ? "gpt-4o" : "gpt-4o-mini";
  const defaultAnthropic = referenceImage ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const model = resolveModel({ openaiApiKey, anthropicApiKey, modelId, defaultOpenai, defaultAnthropic });

  // Build content (supports multimodal with reference image)
  const content: any[] = [];
  if (referenceImage) {
    content.push({ type: "image", image: referenceImage });
  }
  content.push({
    type: "text",
    text: `Current HTML:\n${currentHtml}\n\nInstruction: ${instruction}\n\nReturn the updated HTML.`,
  });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content }],
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

    // Enrich images (DALL-E if openaiApiKey, otherwise Pexels)
    html = await enrichImages(html, pexelsApiKey, openaiApiKey);

    onDone?.(html);
    return html;
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(err?.message || "Refine failed");
    onError?.(error);
    throw error;
  }
}
