import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { findImageSlots, type EnrichImagesOptions } from "./images/enrichImages";
import { searchImage } from "./images/pexels";
import { generateImage } from "./images/dalleImages";
import type { Section3 } from "./types";

async function resolveModel(opts: { openaiApiKey?: string; anthropicApiKey?: string; modelId?: string; defaultOpenai: string; defaultAnthropic: string }) {
  // Prefer Anthropic for text generation when both keys are available
  const anthropicKey = opts.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic(opts.modelId || opts.defaultAnthropic);
  }
  // Fallback to OpenAI for text only if no Anthropic key
  const openaiKey = opts.openaiApiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(opts.modelId || opts.defaultOpenai);
  }
  // Last resort: createAnthropic() without key (uses env var)
  return createAnthropic()(opts.modelId || opts.defaultAnthropic);
}

export const SYSTEM_PROMPT = `You are a world-class web designer who creates AWARD-WINNING landing pages. Your designs win Awwwards, FWA, and CSS Design Awards. You think in terms of visual hierarchy, whitespace, and emotional impact.

RULES:
- Each section is a complete <section> tag with Tailwind CSS classes
- Use Tailwind CDN classes ONLY (no custom CSS, no @apply, no @import, no @tailwind directives)
- NO JavaScript, only HTML+Tailwind
- Each section must be independent and self-contained
- Responsive: mobile-first with sm/md/lg/xl breakpoints
- All text content in Spanish unless the prompt specifies otherwise
- Use real-looking content (not Lorem ipsum) — make it specific to the prompt

RESPONSIVE — MANDATORY:
- EVERY grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 (NEVER grid-cols-3 alone)
- EVERY flex row: flex flex-col md:flex-row (NEVER flex flex-row alone)
- Text sizes: text-3xl md:text-5xl lg:text-7xl (NEVER text-7xl alone)
- Images: w-full h-auto object-cover max-w-full
- Padding: px-4 md:px-8 lg:px-16 (NEVER px-16 alone)
- Hide decorative on mobile if breaks layout: hidden md:block

IMAGES — CRITICAL:
- EVERY image MUST use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER use <img> without data-image-query
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image URL
- Queries must be generic stock-photo friendly (e.g. "modern office" not "Juan's cybercafe")
- For avatar-like elements, use colored divs with initials instead of img tags (e.g. <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold">JD</div>)

COLOR SYSTEM — CRITICAL (READ CAREFULLY):
- Use semantic color classes: bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary, bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted, bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded Tailwind color classes: NO bg-gray-*, bg-black, bg-white, bg-indigo-*, bg-blue-*, bg-purple-*, text-gray-*, text-black, text-white, etc.
- The ONLY exception: border-gray-200 or border-gray-700 for subtle dividers.
- ALL backgrounds MUST use: bg-primary, bg-primary-dark, bg-surface, bg-surface-alt
- ALL text MUST use: text-on-surface, text-on-surface-muted, text-on-primary, text-accent. Use text-primary ONLY on bg-surface/bg-surface-alt (it's the same hue as bg-primary — invisible on primary backgrounds).
- CONTRAST RULE: on bg-primary or bg-primary-dark → use ONLY text-on-primary. On bg-surface or bg-surface-alt → use text-on-surface, text-on-surface-muted, or text-primary. NEVER use text-primary on bg-primary — they are the SAME COLOR. NEVER put text-on-surface on bg-primary or text-on-primary on bg-surface. text-accent is decorative — use sparingly on bg-surface/bg-surface-alt only.
- ANTI-PATTERN: NEVER put bg-primary on BOTH the section AND elements inside it. If section is bg-primary, inner cards/elements should be bg-surface. If section is bg-surface, cards can use bg-surface-alt or bg-primary.
- For gradients: from-primary to-primary-dark, from-surface to-surface-alt
- For hover: hover:bg-primary-dark, hover:bg-primary-light

DESIGN PHILOSOPHY — what separates good from GREAT:
- WHITESPACE is your best friend. Generous padding (py-24, py-32, px-8). Let elements breathe.
- CONTRAST: mix dark sections with light ones. Alternate bg-primary and bg-surface sections.
- TYPOGRAPHY: use extreme size differences for hierarchy (text-7xl headline next to text-sm label)
- DEPTH: overlapping elements, negative margins (-mt-12), z-index layering, shadows
- ASYMMETRY: avoid centering everything. Use grid-cols-5 with col-span-3 + col-span-2. Offset elements.
- TEXTURE: use subtle patterns, gradients, border treatments, rounded-3xl mixed with sharp edges
- Each section should have a COMPLETELY DIFFERENT layout from the others

SECTION LAYOUT — CRITICAL:
- Each <section> must be full-width (bg goes edge-to-edge). NO max-w on the section itself.
- Constrain content inside with a wrapper div: <section class="bg-primary py-24"><div class="max-w-7xl mx-auto px-4 md:px-8">...content...</div></section>
- EVERY section follows this pattern. The <section> handles bg color + vertical padding. The inner <div> handles horizontal padding + max-width.

TESTIMONIALS SECTION:
- Cards MUST use bg-surface or bg-surface-alt with text-on-surface
- If section bg is bg-primary or bg-primary-dark, cards MUST be bg-surface (light cards on dark bg)
- Quote text: text-on-surface, italic
- Avatar: colored div with initials (bg-accent text-on-primary or bg-primary-light text-on-primary)
- Name: text-on-surface font-semibold. Role/company: text-on-surface-muted
- NEVER use same dark bg for both section AND cards

HERO SECTION — your masterpiece:
- Use a 2-column grid (lg:grid-cols-2) that fills the full height, NOT content floating in empty space
- Left column: headline + description + CTAs, vertically centered with flex flex-col justify-center
- Right column: large hero image (data-image-query) filling the column, or a bento-grid of image + stat cards
- Bold oversized headline (text-4xl md:text-6xl lg:text-7xl font-black leading-tight)
- Tag/label above headline (uppercase, tracking-wider, text-xs text-accent)
- Short description paragraph (text-lg text-on-surface-muted, max-w-lg)
- 2 CTAs: primary (large, px-8 py-4, with → arrow) + secondary (ghost/outlined)
- Optional: social proof bar below CTAs (avatar stack + "2,847+ users" text)
- Min height: min-h-[90vh] with items-center on the grid so content is vertically centered
- CRITICAL: the grid must stretch to fill the section height. Use min-h-[90vh] on the grid container itself, not just the section
- NEVER leave large empty areas — if using min-h-[90vh], content must be centered/distributed within it

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

export const PROMPT_SUFFIX = `

OUTPUT FORMAT: NDJSON — one JSON object per line, NO wrapper array, NO markdown fences.
Each line: {"label": "Short Label", "html": "<section>...</section>"}

Generate 7-9 sections. Always start with Hero and end with Footer.
IMPORTANT: Make each section VISUALLY UNIQUE — different layouts, different background colors, different grid structures.
Think like a premium design agency creating a $50K landing page.
NO generic Bootstrap layouts. Use creative grids, bento layouts, overlapping elements, asymmetric columns.`;

/**
 * Extract complete JSON objects from accumulated text using brace-depth tracking.
 */
export function extractJsonObjects(text: string): [any[], string] {
  const objects: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining.startsWith("{")) {
      const nextBrace = remaining.indexOf("{");
      if (nextBrace === -1) break;
      remaining = remaining.slice(nextBrace);
      continue;
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = 0; i < remaining.length; i++) {
      const ch = remaining[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end === -1) break;

    const candidate = remaining.slice(0, end + 1);
    remaining = remaining.slice(end + 1);

    try {
      objects.push(JSON.parse(candidate));
    } catch {
      // malformed, skip
    }
  }

  return [objects, remaining];
}

/** Inline SVG data URI: animated "generating" placeholder for images */
const LOADING_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="%23e5e7eb"/><stop offset="50%" stop-color="%23f9fafb"/><stop offset="100%" stop-color="%23e5e7eb"/></linearGradient></defs><rect fill="%23f3f4f6" width="800" height="500" rx="12"/><rect fill="url(%23sh)" width="800" height="500" rx="12"><animate attributeName="x" from="-800" to="800" dur="1.5s" repeatCount="indefinite"/></rect><circle cx="370" cy="230" r="8" fill="%239ca3af" opacity=".5"><animate attributeName="opacity" values=".3;1;.3" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="400" cy="230" r="8" fill="%239ca3af" opacity=".5"><animate attributeName="opacity" values=".3;1;.3" dur="1.5s" begin=".2s" repeatCount="indefinite"/></circle><circle cx="430" cy="230" r="8" fill="%239ca3af" opacity=".5"><animate attributeName="opacity" values=".3;1;.3" dur="1.5s" begin=".4s" repeatCount="indefinite"/></circle><text x="400" y="270" text-anchor="middle" fill="%239ca3af" font-family="system-ui" font-size="14">Generando imagen...</text></svg>`)}`;

/** Replace data-image-query attrs with animated loading placeholders */
function addLoadingPlaceholders(html: string): string {
  return html.replace(
    /(<img\s[^>]*)data-image-query="([^"]+)"([^>]*?)(?:\s*\/?>)/gi,
    (_match, before, query, after) => {
      // Don't add src if already has one
      if (before.includes('src=') || after.includes('src=')) return _match;
      return `${before}src="${LOADING_PLACEHOLDER}" data-image-query="${query}" alt="${query}"${after}>`;
    }
  );
}

export interface GenerateOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var */
  anthropicApiKey?: string;
  /** OpenAI API key. If provided, uses GPT-4o instead of Claude */
  openaiApiKey?: string;
  /** Landing page description prompt */
  prompt: string;
  /** Reference image (base64 data URI) for vision-based generation */
  referenceImage?: string;
  /** Extra instructions appended to the prompt */
  extraInstructions?: string;
  /** Custom system prompt (overrides default SYSTEM_PROMPT) */
  systemPrompt?: string;
  /** Model ID (default: gpt-4o for OpenAI, claude-sonnet-4-6 for Anthropic) */
  model?: string;
  /** Pexels API key for image enrichment. Falls back to PEXELS_API_KEY env var */
  pexelsApiKey?: string;
  /** Called with temp DALL-E URL + query, returns permanent URL. Use to persist to S3/etc. */
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  /** Called when a new section is parsed from the stream */
  onSection?: (section: Section3) => void;
  /** Called when a section's images are enriched */
  onImageUpdate?: (sectionId: string, html: string) => void;
  /** Called when generation is complete */
  onDone?: (sections: Section3[]) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Generate a landing page with streaming AI + image enrichment.
 * Returns all generated sections when complete.
 */
export async function generateLanding(options: GenerateOptions): Promise<Section3[]> {
  const {
    anthropicApiKey,
    openaiApiKey: _openaiApiKey,
    prompt,
    referenceImage,
    extraInstructions,
    systemPrompt = SYSTEM_PROMPT,
    model: modelId,
    pexelsApiKey,
    persistImage,
    onSection,
    onImageUpdate,
    onDone,
    onError,
  } = options;

  const openaiApiKey = _openaiApiKey || process.env.OPENAI_API_KEY;
  const model = await resolveModel({ openaiApiKey, anthropicApiKey, modelId, defaultOpenai: "gpt-4o", defaultAnthropic: "claude-sonnet-4-6" });

  // Build prompt content (supports multimodal with reference image)
  const extra = extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : "";
  const content: any[] = [];
  if (referenceImage) {
    // Convert data URLs to Uint8Array (AI SDK doesn't accept data: URLs directly)
    const base64Match = referenceImage.match(/^data:([^;]+);base64,(.+)$/);
    if (base64Match) {
      content.push({ type: "image", image: new Uint8Array(Buffer.from(base64Match[2], "base64")), mimeType: base64Match[1] });
    } else {
      content.push({ type: "image", image: referenceImage });
    }
    content.push({
      type: "text",
      text: `Generate a landing page inspired by this reference image for: ${prompt}${extra}${PROMPT_SUFFIX}`,
    });
  } else {
    content.push({
      type: "text",
      text: `Generate a landing page for: ${prompt}${extra}${PROMPT_SUFFIX}`,
    });
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  const allSections: Section3[] = [];
  const imagePromises: Promise<void>[] = [];
  let sectionOrder = 0;
  let buffer = "";

  try {
    for await (const chunk of result.textStream) {
      buffer += chunk;

      const [objects, remaining] = extractJsonObjects(buffer);
      buffer = remaining;

      for (const obj of objects) {
        if (!obj.html || !obj.label) continue;

        const section: Section3 = {
          id: nanoid(8),
          order: sectionOrder++,
          html: obj.html,
          label: obj.label,
        };

        // Add loading placeholders so images don't show as broken while DALL-E generates
        section.html = addLoadingPlaceholders(section.html);
        allSections.push(section);
        onSection?.(section);

        // Enrich images (DALL-E if openaiApiKey, otherwise Pexels)
        const slots = findImageSlots(section.html);
        if (slots.length > 0) {
          const sectionRef = section;
          const slotsSnapshot = slots.map((s) => ({ ...s }));
          imagePromises.push(
            (async () => {
              const results = await Promise.allSettled(
                slotsSnapshot.map(async (slot) => {
                  let url: string | null = null;
                  // 1. DALL-E if openaiApiKey provided
                  if (openaiApiKey) {
                    try {
                      const tempUrl = await generateImage(slot.query, openaiApiKey);
                      url = persistImage ? await persistImage(tempUrl, slot.query) : tempUrl;
                    } catch (e) {
                      console.warn(`[dalle] failed for "${slot.query}":`, e);
                    }
                  }
                  // 2. Pexels fallback
                  if (!url) {
                    const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
                    url = img?.url || null;
                  }
                  // 3. Placeholder fallback
                  url ??= `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;
                  return { slot, url };
                })
              );
              let html = sectionRef.html;
              for (const r of results) {
                if (r.status === "fulfilled" && r.value) {
                  const { slot, url } = r.value;
                  const replacement = slot.replaceStr.replace("{url}", url);
                  html = html.replaceAll(slot.searchStr, replacement);
                }
              }
              if (html !== sectionRef.html) {
                sectionRef.html = html;
                onImageUpdate?.(sectionRef.id, html);
              }
            })()
          );
        }
      }
    }

    // Parse remaining buffer
    if (buffer.trim()) {
      let cleaned = buffer.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
      }
      const [lastObjects] = extractJsonObjects(cleaned);
      for (const obj of lastObjects) {
        if (!obj.html || !obj.label) continue;
        const section: Section3 = {
          id: nanoid(8),
          order: sectionOrder++,
          html: obj.html,
          label: obj.label,
        };
        // Add loading placeholders so images don't show as broken while DALL-E generates
        section.html = addLoadingPlaceholders(section.html);
        allSections.push(section);
        onSection?.(section);

        // Enrich images for remaining-buffer sections too
        const slots = findImageSlots(section.html);
        if (slots.length > 0) {
          const sectionRef = section;
          const slotsSnapshot = slots.map((s) => ({ ...s }));
          imagePromises.push(
            (async () => {
              const results = await Promise.allSettled(
                slotsSnapshot.map(async (slot) => {
                  let url: string | null = null;
                  const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
                  url = img?.url || null;
                  url ??= `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;
                  return { slot, url };
                })
              );
              let html = sectionRef.html;
              for (const r of results) {
                if (r.status === "fulfilled" && r.value) {
                  const { slot, url } = r.value;
                  const replacement = slot.replaceStr.replace("{url}", url);
                  html = html.replaceAll(slot.searchStr, replacement);
                }
              }
              if (html !== sectionRef.html) {
                sectionRef.html = html;
                onImageUpdate?.(sectionRef.id, html);
              }
            })()
          );
        }
      }
    }

    // Wait for image enrichment
    await Promise.allSettled(imagePromises);

    // Final fallback: any <img> still without src gets a placeholder
    for (const section of allSections) {
      const before = section.html;
      section.html = section.html.replace(
        /<img\s(?![^>]*\bsrc=)([^>]*?)>/gi,
        (_match, attrs) => {
          const altMatch = attrs.match(/alt="([^"]*?)"/);
          const query = altMatch?.[1] || "image";
          return `<img src="https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(query.slice(0, 30))}" ${attrs}>`;
        }
      );
      // Also replace any remaining data-image-query that wasn't enriched
      section.html = section.html.replace(
        /data-image-query="([^"]+)"/g,
        (_match, query) => {
          return `src="https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(query.slice(0, 30))}" data-enriched="placeholder"`;
        }
      );
      if (section.html !== before) {
        onImageUpdate?.(section.id, section.html);
      }
    }

    onDone?.(allSections);
    return allSections;
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(err?.message || "Generation failed");
    onError?.(error);
    throw error;
  }
}
