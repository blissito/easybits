import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { findImageSlots } from "./images/enrichImages";
import { searchImage } from "./images/pexels";
import { generateImage } from "./images/dalleImages";
import type { Section3 } from "./types";

async function resolveModel(opts: { openaiApiKey?: string; anthropicApiKey?: string; modelId?: string; defaultOpenai: string; defaultAnthropic: string }) {
  const openaiKey = opts.openaiApiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(opts.modelId || opts.defaultOpenai);
  }
  const anthropic = opts.anthropicApiKey
    ? createAnthropic({ apiKey: opts.anthropicApiKey })
    : createAnthropic();
  return anthropic(opts.modelId || opts.defaultAnthropic);
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

IMAGES — CRITICAL:
- Use <img data-image-query="english search query" alt="description" class="..."/>
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image URL
- For avatar-like elements, use colored divs with initials instead of img tags (e.g. <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold">JD</div>)

COLOR SYSTEM — CRITICAL (READ CAREFULLY):
- Use semantic color classes: bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary, bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted, bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded Tailwind color classes: NO bg-gray-*, bg-black, bg-white, bg-indigo-*, bg-blue-*, bg-purple-*, text-gray-*, text-black, text-white, etc.
- The ONLY exception: border-gray-200 or border-gray-700 for subtle dividers.
- ALL backgrounds MUST use: bg-primary, bg-primary-dark, bg-surface, bg-surface-alt
- ALL text MUST use: text-on-surface, text-on-surface-muted, text-on-primary, text-primary, text-accent
- CONTRAST RULE: on bg-primary or bg-primary-dark → use text-on-primary. On bg-surface or bg-surface-alt → use text-on-surface or text-on-surface-muted. NEVER put text-on-surface on bg-primary or vice versa.
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

HERO SECTION — your masterpiece:
- Bento-grid or asymmetric layout, NOT a generic centered hero
- Large headline block + smaller stat/metric cards in a grid
- Real social proof: "2,847+ users", avatar stack (colored divs with initials), star ratings
- Bold oversized headline (text-6xl/7xl font-black leading-none)
- Tag/label above headline (uppercase, tracking-wider, text-xs)
- 2 CTAs: primary (large, with → arrow) + secondary (ghost/outlined)
- Real image via data-image-query
- Min height: min-h-[90vh] with generous padding

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
    content.push({ type: "image", image: referenceImage });
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
                  if (openaiApiKey) {
                    url = await generateImage(slot.query, openaiApiKey).catch(() => null);
                  }
                  if (!url) {
                    const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
                    url = img?.url || null;
                  }
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
        allSections.push(section);
        onSection?.(section);
      }
    }

    // Wait for image enrichment
    await Promise.allSettled(imagePromises);

    onDone?.(allSections);
    return allSections;
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(err?.message || "Generation failed");
    onError?.(error);
    throw error;
  }
}
