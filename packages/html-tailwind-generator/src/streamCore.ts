import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { findImageSlots } from "./images/enrichImages";
import { searchImage } from "./images/pexels";
import { generateImage } from "./images/dalleImages";
import { generateSvg } from "./images/svgGenerator";
import type { Section3 } from "./types";
import { sanitizeSemanticColors } from "./sanitizeColors";

/**
 * Resolve AI model from available keys.
 * If modelId is already a LanguageModel object, return it directly.
 * Prefers Anthropic, falls back to OpenAI.
 */
function isOpenAiModel(id: string): boolean {
  return /^(gpt-|o[1-9]|dall-e|tts-|whisper|chatgpt-)/.test(id);
}

function isLanguageModel(value: unknown): value is import("ai").LanguageModel {
  return typeof value === "object" && value !== null && "modelId" in value && "provider" in value;
}

export async function resolveModel(opts: {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  modelId?: string | import("ai").LanguageModel;
  defaultOpenai: string;
  defaultAnthropic: string;
}) {
  // If modelId is already a model object, return it directly
  if (opts.modelId && isLanguageModel(opts.modelId)) {
    return opts.modelId;
  }

  const modelId = opts.modelId as string | undefined;

  if (modelId && isOpenAiModel(modelId)) {
    const openaiKey = opts.openaiApiKey || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: openaiKey })(modelId);
    }
    // OpenAI model requested but no key — fall through to Anthropic default
  } else if (modelId) {
    const anthropicKey = opts.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      return createAnthropic({ apiKey: anthropicKey })(modelId);
    }
  }
  // No explicit modelId — prefer Anthropic, fallback to OpenAI
  const anthropicKey = opts.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return createAnthropic({ apiKey: anthropicKey })(opts.defaultAnthropic);
  }
  const openaiKey = opts.openaiApiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    return createOpenAI({ apiKey: openaiKey })(opts.defaultOpenai);
  }
  return createAnthropic()(opts.defaultAnthropic);
}

/**
 * Convert data URL to Uint8Array for AI SDK vision.
 */
export function dataUrlToImagePart(dataUrl: string): { image: Uint8Array; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    image: new Uint8Array(Buffer.from(match[2], "base64")),
    mimeType: match[1],
  };
}

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

/** Inline shimmer SVG used as src for loading image placeholders */
const LOADING_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect fill="#f3f4f6" width="800" height="500" rx="12"/><g opacity=".4"><rect x="320" y="200" width="160" height="4" rx="2" fill="#d1d5db"><animate attributeName="opacity" values=".3;.8;.3" dur="1.5s" repeatCount="indefinite"/></rect><rect x="280" y="215" width="240" height="4" rx="2" fill="#d1d5db"><animate attributeName="opacity" values=".3;.8;.3" dur="1.5s" begin=".3s" repeatCount="indefinite"/></rect><rect x="340" y="230" width="120" height="4" rx="2" fill="#d1d5db"><animate attributeName="opacity" values=".3;.8;.3" dur="1.5s" begin=".6s" repeatCount="indefinite"/></rect></g><g transform="translate(376,150)" opacity=".3"><path d="M0 28V4a4 4 0 014-4h40a4 4 0 014 4v24a4 4 0 01-4 4H4a4 4 0 01-4-4z" fill="#d1d5db"/><circle cx="14" cy="12" r="4" fill="#9ca3af"/><path d="M4 28l10-10 6 6 8-8 16 16H4z" fill="#9ca3af" opacity=".5"/></g></svg>')}`;

/** Inline SVG placeholder for loading charts */
const SVG_LOADING_PLACEHOLDER = `<div class="w-full h-48 bg-gray-50 rounded-lg flex items-center justify-center animate-pulse"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg></div>`;

/** Replace data-svg-chart divs with loading placeholders */
export function addSvgLoadingPlaceholders(html: string): string {
  return html.replace(
    /<div\s([^>]*?)data-svg-chart="([^"]+)"([^>]*?)>[\s\S]*?<\/div>/gi,
    (_match, before, chart, after) => {
      return `<div ${before}data-svg-chart="${chart}"${after}>${SVG_LOADING_PLACEHOLDER}</div>`;
    }
  );
}

/** Replace data-image-query attrs with animated loading placeholders */
export function addLoadingPlaceholders(html: string): string {
  return html.replace(
    /(<img\s[^>]*)data-image-query="([^"]+)"([^>]*?)(?:\s*\/?>)/gi,
    (_match, before, query, after) => {
      if (before.includes('src=') || after.includes('src=')) return _match;
      return `${before}src="${LOADING_PLACEHOLDER_SRC}" data-image-query="${query}" alt="${query}"${after}>`;
    }
  );
}

/** Enrich a section's images (Pexels → DALL-E → placeholder fallback). Mutates section.html in place. */
export async function enrichSectionImages(
  section: Section3,
  opts: {
    pexelsApiKey?: string;
    openaiApiKey?: string;
    persistImage?: (tempUrl: string, query: string) => Promise<string>;
    onImageUpdate?: (sectionId: string, html: string) => void;
  }
): Promise<void> {
  const slots = findImageSlots(section.html);
  if (slots.length === 0) return;
  const results = await Promise.allSettled(
    slots.map(async (slot) => {
      let url: string | null = null;
      if (opts.pexelsApiKey) {
        const img = await searchImage(slot.query, opts.pexelsApiKey).catch(() => null);
        url = img?.url || null;
      }
      if (!url && opts.openaiApiKey) {
        try {
          const tempUrl = await generateImage(slot.query, opts.openaiApiKey);
          url = opts.persistImage ? await opts.persistImage(tempUrl, slot.query) : tempUrl;
        } catch (e) {
          console.warn(`[dalle] failed for "${slot.query}":`, e);
        }
      }
      url ??= `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;
      return { slot, url };
    })
  );
  let html = section.html;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const { slot, url } = r.value;
      const replacement = slot.replaceStr.replace("{url}", url);
      html = html.replaceAll(slot.searchStr, replacement);
    }
  }
  if (html !== section.html) {
    section.html = html;
    opts.onImageUpdate?.(section.id, html);
  }
}

/** Enrich a section's SVG chart placeholders. Mutates section.html in place. */
export async function enrichSectionSvgCharts(
  section: Section3,
  opts: {
    anthropicApiKey?: string;
    onImageUpdate?: (sectionId: string, html: string) => void;
  }
): Promise<void> {
  const svgRegex = /<div\s[^>]*data-svg-chart="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;
  const svgMatches: { fullMatch: string; prompt: string }[] = [];
  let svgM: RegExpExecArray | null;
  while ((svgM = svgRegex.exec(section.html)) !== null) {
    svgMatches.push({ fullMatch: svgM[0], prompt: svgM[1] });
  }
  if (svgMatches.length === 0) return;
  const anthropicKey = opts.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  const results = await Promise.allSettled(
    svgMatches.map(async ({ fullMatch, prompt }) => {
      try {
        const svg = await generateSvg(prompt, anthropicKey);
        return { fullMatch, svg };
      } catch (e) {
        console.warn(`[svg] failed for "${prompt}":`, e);
        return { fullMatch, svg: `<div class="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">${prompt}</div>` };
      }
    })
  );
  let html = section.html;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      html = html.replace(r.value.fullMatch, r.value.svg);
    }
  }
  if (html !== section.html) {
    section.html = html;
    opts.onImageUpdate?.(section.id, html);
  }
}

export interface StreamGenerateOptions {
  /** Anthropic API key */
  anthropicApiKey?: string;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** Model ID override or pre-built LanguageModel object */
  model?: string | import("ai").LanguageModel;
  /** System prompt */
  systemPrompt: string;
  /** User message content (text or multimodal parts) */
  userContent: any[];
  /** Pexels API key for image enrichment */
  pexelsApiKey?: string;
  /** Persist DALL-E images to permanent storage */
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
  /** Called when a new section is parsed */
  onSection?: (section: Section3) => void;
  /** Called when a section's images are enriched */
  onImageUpdate?: (sectionId: string, html: string) => void;
  /** Called with raw text buffer for real-time partial streaming */
  onRawChunk?: (buffer: string, completedCount: number) => void;
  /** Called when generation is complete */
  onDone?: (sections: Section3[]) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Core streaming generation: stream AI text → parse NDJSON → emit sections → enrich images.
 * Used by both generateLanding and generateDocument.
 */
export async function streamGenerate(options: StreamGenerateOptions): Promise<Section3[]> {
  const {
    anthropicApiKey,
    openaiApiKey: _openaiApiKey,
    model: modelId,
    systemPrompt,
    userContent,
    pexelsApiKey,
    persistImage,
    onSection,
    onImageUpdate,
    onRawChunk,
    onDone,
    onError,
  } = options;

  const openaiApiKey = _openaiApiKey || process.env.OPENAI_API_KEY;
  const model = await resolveModel({
    openaiApiKey,
    anthropicApiKey,
    modelId,
    defaultOpenai: "gpt-4o",
    defaultAnthropic: "claude-sonnet-4-6",
  });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const allSections: Section3[] = [];
  const imagePromises: Promise<void>[] = [];
  let sectionOrder = 0;
  let buffer = "";

  function enrichSvgCharts(sectionRef: Section3) {
    const svgRegex = /<div\s[^>]*data-svg-chart="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;
    const svgMatches: { fullMatch: string; prompt: string }[] = [];
    let svgM: RegExpExecArray | null;
    while ((svgM = svgRegex.exec(sectionRef.html)) !== null) {
      svgMatches.push({ fullMatch: svgM[0], prompt: svgM[1] });
    }
    if (svgMatches.length === 0) return;

    const anthropicKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    imagePromises.push(
      (async () => {
        const results = await Promise.allSettled(
          svgMatches.map(async ({ fullMatch, prompt }) => {
            try {
              const svg = await generateSvg(prompt, anthropicKey);
              return { fullMatch, svg };
            } catch (e) {
              console.warn(`[svg] failed for "${prompt}":`, e);
              return { fullMatch, svg: `<div class="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">${prompt}</div>` };
            }
          })
        );
        let html = sectionRef.html;
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            html = html.replace(r.value.fullMatch, r.value.svg);
          }
        }
        if (html !== sectionRef.html) {
          sectionRef.html = html;
          onImageUpdate?.(sectionRef.id, html);
        }
      })()
    );
  }

  function enrichSection(sectionRef: Section3) {
    const slots = findImageSlots(sectionRef.html);
    if (slots.length === 0) return;
    const slotsSnapshot = slots.map((s) => ({ ...s }));
    imagePromises.push(
      (async () => {
        const results = await Promise.allSettled(
          slotsSnapshot.map(async (slot) => {
            let url: string | null = null;
            // 1. Pexels first (free, fast)
            if (pexelsApiKey) {
              const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
              url = img?.url || null;
            }
            // 2. DALL-E fallback
            if (!url && openaiApiKey) {
              try {
                const tempUrl = await generateImage(slot.query, openaiApiKey);
                url = persistImage ? await persistImage(tempUrl, slot.query) : tempUrl;
              } catch (e) {
                console.warn(`[dalle] failed for "${slot.query}":`, e);
              }
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

  function processObject(obj: any) {
    if (!obj.html || !obj.label) return;
    const section: Section3 = {
      id: nanoid(8),
      order: sectionOrder++,
      html: sanitizeSemanticColors(addSvgLoadingPlaceholders(addLoadingPlaceholders(obj.html))),
      label: obj.label,
    };
    allSections.push(section);
    onSection?.(section);
    enrichSection(section);
    enrichSvgCharts(section);
  }

  try {
    let chunkCount = 0;
    for await (const chunk of result.textStream) {
      buffer += chunk;
      chunkCount++;

      const [objects, remaining] = extractJsonObjects(buffer);
      buffer = remaining;
      for (const obj of objects) {
        chunkCount = 0;
        processObject(obj);
      }

      if (onRawChunk && chunkCount % 5 === 0 && buffer.length > 20) {
        onRawChunk(buffer, allSections.length);
      }
    }

    // Parse remaining buffer
    if (buffer.trim()) {
      let cleaned = buffer.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const [lastObjects] = extractJsonObjects(cleaned);
      for (const obj of lastObjects) processObject(obj);
    }

    // Wait for image enrichment
    await Promise.allSettled(imagePromises);

    // Final fallback for images without src
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
