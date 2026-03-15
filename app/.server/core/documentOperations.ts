import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { deployLanding, unpublishLanding } from "./landingOperations";
import { resolveAiKey } from "./aiKeyOperations";
import { checkAiGenerationLimit, incrementAiGeneration } from "../aiGenerationLimit";
import { getAiModel, resolveModelLocal } from "../aiModels";
import { generateDocumentParallel } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import { streamText } from "ai";
import { enrichImages, findImageSlots, generateSvg } from "@easybits.cloud/html-tailwind-generator/images";
import { sanitizeSemanticColors } from "../sanitizeColors";
import type { Section3 } from "~/lib/landing3/types";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "../storage";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listDocuments(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const items = await db.landing.findMany({
    where: { ownerId: ctx.user.id, version: 4 },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prompt: true,
      theme: true,
      status: true,
      websiteId: true,
      sections: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return {
    items: items.map((d) => ({
      id: d.id,
      name: d.name,
      prompt: d.prompt,
      theme: (d.metadata as any)?.theme || d.theme,
      status: d.status,
      websiteId: d.websiteId,
      pageCount: Array.isArray(d.sections) ? d.sections.length : 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  };
}

export async function getDocument(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  return doc;
}

export async function createDocument(
  ctx: AuthContext,
  opts: {
    name: string;
    prompt?: string;
    sections?: Array<{ id: string; order: number; html?: string; type?: string; name?: string }>;
    theme?: string;
    customColors?: Record<string, string>;
  }
) {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim();
  if (!name) throwJson("Name required", 400);

  const metadata: Record<string, unknown> = {};
  if (opts.theme) metadata.theme = opts.theme;
  if (opts.customColors) metadata.customColors = opts.customColors;

  return db.landing.create({
    data: {
      name,
      prompt: opts.prompt || "",
      sections: (opts.sections ?? []) as any,
      version: 4,
      theme: "default",
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      ownerId: ctx.user.id,
    },
  });
}

export async function updateDocument(
  ctx: AuthContext,
  id: string,
  opts: {
    name?: string;
    prompt?: string;
    sections?: Array<{ id: string; order: number; html?: string; type?: string; name?: string }>;
    theme?: string;
    customColors?: Record<string, string>;
  }
) {
  requireScope(ctx, "WRITE");
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.prompt !== undefined) updates.prompt = opts.prompt;
  if (opts.sections !== undefined) updates.sections = opts.sections as any;

  // Theme/customColors go in metadata
  if (opts.theme !== undefined || opts.customColors !== undefined) {
    const existing = (doc.metadata as Record<string, unknown>) || {};
    if (opts.theme !== undefined) existing.theme = opts.theme;
    if (opts.customColors !== undefined) existing.customColors = opts.customColors;
    updates.metadata = existing;
  }

  return db.landing.update({ where: { id }, data: updates });
}

export async function deleteDocument(ctx: AuthContext, id: string) {
  requireScope(ctx, "DELETE");
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  await db.landing.delete({ where: { id } });
  return { success: true };
}

export async function deployDocument(ctx: AuthContext, id: string) {
  // Validate it's a document before delegating
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  return deployLanding(ctx, id);
}

export async function unpublishDocument(ctx: AuthContext, id: string) {
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  return unpublishLanding(ctx, id);
}

// --- AI Document Operations ---

interface DirectionOpts {
  name?: string;
  headingFont?: string;
  bodyFont?: string;
  colors?: { primary: string; accent: string; surface: string; surfaceAlt: string; text: string };
  mood?: string;
  layoutHint?: string;
}

async function uploadLogoToStorage(dataUrl: string, userId: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const buffer = Buffer.from(match[2], "base64");
  const ext = match[1].includes("png") ? "png" : match[1].includes("svg") ? "svg" : "webp";
  const key = `logos/${userId}/${crypto.randomUUID()}.${ext}`;
  const client = getPlatformDefaultClient({ bucket: PUBLIC_BUCKET });
  const putUrl = await client.getPutUrl(key, { timeout: 60 });
  await fetch(putUrl, { method: "PUT", body: buffer, headers: { "Content-Type": match[1] } });
  return `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${key}`;
}

export async function generateDocumentAI(
  ctx: AuthContext,
  id: string,
  opts: {
    prompt: string;
    pageCount?: number;
    direction?: DirectionOpts;
    extraInstructions?: string;
    logoUrl?: string;
    skipCover?: boolean;
  }
) {
  requireScope(ctx, "WRITE");
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) throwJson(`Generation limit reached (${genLimit.limit})`, 429);

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;
  const resolvedLogoUrl = opts.logoUrl ? await uploadLogoToStorage(opts.logoUrl, ctx.user.id) : undefined;

  const docModelId = await getAiModel("docGenerate");
  const docModel = resolveModelLocal(docModelId, openaiKey || undefined, userKey || undefined);
  const outlineModelId = await getAiModel("docDirections");
  const outlineModel = resolveModelLocal(outlineModelId, openaiKey || undefined, userKey || undefined);

  const allSections: Section3[] = [];
  const startTime = Date.now();
  let usageTokens = { inputTokens: 0, outputTokens: 0 };

  await generateDocumentParallel({
    prompt: opts.prompt,
    logoUrl: resolvedLogoUrl,
    extraInstructions: opts.extraInstructions,
    direction: opts.direction,
    pexelsApiKey: process.env.PEXELS_API_KEY,
    model: docModel,
    outlineModel,
    pageCount: opts.pageCount,
    skipCover: !!opts.skipCover,
    onOutline() {},
    onPageChunk() {},
    async onPageComplete(_pageIndex, section) {
      allSections.push(section);
    },
    onUsage(usage) {
      usageTokens = usage;
    },
    onImageUpdate(sectionId, html) {
      const s = allSections.find((s) => s.id === sectionId);
      if (s) s.html = html;
    },
    async onDone() {
      await incrementAiGeneration(ctx.user.id, undefined, {
        type: "generate",
        product: "document",
        modelId: docModelId,
        inputTokens: usageTokens.inputTokens,
        outputTokens: usageTokens.outputTokens,
        resourceId: id,
        pageCount: allSections.length,
        durationMs: Date.now() - startTime,
      });

      allSections.sort((a, b) => a.order - b.order);
      let finalSections = allSections;
      if (opts.skipCover) {
        const existing = await db.landing.findUnique({ where: { id }, select: { sections: true } });
        const existingSections = (existing?.sections as any[]) || [];
        finalSections = [...existingSections, ...allSections.map((s, i) => ({ ...s, order: existingSections.length + i }))] as any;
      }
      await db.landing.update({ where: { id }, data: { sections: finalSections as any } });
    },
    onError(err) {
      throw err;
    },
  });

  return { sections: allSections, total: allSections.length };
}

const VARIANT_SYSTEM_PROMPT = `You are an elite document designer. You create stunning visual variants of document pages for letter-sized (8.5" × 11") format.

TASK: Given an existing page, create a COMPLETELY DIFFERENT visual design while keeping the SAME text content and the SAME color theme.

RULES:
- Output ONLY the HTML <section>...</section> — no markdown, no explanation
- Keep ALL the same text/data content — change ONLY the visual presentation
- Redesign layout structure, typography scale, decorative elements, spacing, alignment — but KEEP the same color theme
- Use bold, confident design choices — large type contrasts, asymmetric layouts, dramatic whitespace
- Page structure: <section class="w-[8.5in] h-[11in] flex flex-col relative overflow-hidden">
- Content area uses flex-1 overflow-hidden, footer/header bands use shrink-0
- The section is EXACTLY 11in tall — content MUST fit, never exceed
- Keep content within page boundaries (7" × 9.5" effective area with 0.75" margins)
- Decorative elements with absolute positioning MUST stay fully inside the page
- For charts/data viz, use pure CSS bars/progress — NEVER Chart.js or canvas
- For complex charts: <div data-svg-chart="description with data" class="w-full"></div>
- For images: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER use emojis — use SVG icons or geometric shapes instead
- Ensure strong contrast: dark text on light, light text on dark

IMAGE PRESERVATION — CRITICAL:
- NEVER remove or replace existing <img> tags that have real src URLs (https://...)
- If an image has data-enriched="true", it has already been resolved — keep the exact src URL
- Only use data-image-query="..." for NEW images that don't exist yet
- If the user asks to change a specific image, update ONLY that image's data-image-query (remove data-enriched and the old src so the system re-resolves it)
- All other images on the page MUST remain exactly as they are

COLOR SYSTEM — use ONLY semantic Tailwind classes (NEVER hardcode hex/rgb colors):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent`;

const REFINE_SYSTEM_PROMPT = `You are a professional document designer. You refine HTML content for letter-sized (8.5" × 11") document pages.

CRITICAL PRIORITY RULES — SURGICAL EDITS:
- Make the SMALLEST possible change to fulfill the instruction
- If the instruction mentions a specific element, find that exact element and modify ONLY it
- Do NOT change layout, colors, typography, structure, or content that the instruction does not mention
- The output HTML must be 90%+ identical to the input — only the targeted element should differ
- NEVER rewrite the entire page for a small change request

IMAGE PRESERVATION — CRITICAL:
- NEVER remove or replace existing <img> tags that have real src URLs (https://...)
- If an image has data-enriched="true", it has already been resolved — keep the exact src URL
- Only use data-image-query="..." for NEW images that don't exist yet
- If the user asks to change a specific image, update ONLY that image's data-image-query (remove data-enriched and the old src so the system re-resolves it)
- All other images on the page MUST remain exactly as they are

GENERAL RULES:
- Output ONLY the refined HTML <section>...</section> — no markdown, no explanation
- Page structure: <section class="w-[8.5in] h-[11in] flex flex-col relative overflow-hidden">
- The section is EXACTLY 11in tall — content MUST fit, never exceed
- For charts: <div data-svg-chart="description with data" class="w-full"></div>
- For images: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER use emojis — use SVG icons or geometric shapes instead

COLOR SYSTEM — use ONLY semantic Tailwind classes (NEVER hardcode hex/rgb colors):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent`;

async function _refineInternal(
  ctx: AuthContext,
  id: string,
  opts: { sectionId: string; instruction?: string; direction?: DirectionOpts },
  isVariant: boolean
) {
  requireScope(ctx, "WRITE");
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const section = sections.find((s) => s.id === opts.sectionId);
  if (!section) throwJson("Section not found", 404);

  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) throwJson(`Generation limit reached (${genLimit.limit})`, 429);

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

  const pageHtml = section.html || "<section></section>";
  const docContext = doc.prompt ? `\n\nDOCUMENT CONTEXT: ${doc.prompt}` : "";

  // Direction context
  let directionContext = "";
  if (opts.direction?.headingFont || opts.direction?.bodyFont) {
    const d = opts.direction;
    const colors = d.colors || {};
    directionContext = `\n\nDESIGN DIRECTION:
- Mood: ${d.mood || "professional"}
- Layout hint: ${d.layoutHint || "clean and structured"}
- Heading font: ${d.headingFont} (inline style)
- Body font: ${d.bodyFont} (inline style)
- Colors: primary=${colors.primary || "N/A"}, accent=${colors.accent || "N/A"}, surface=${colors.surface || "N/A"}`;
  }

  const systemPrompt = isVariant ? VARIANT_SYSTEM_PROMPT : REFINE_SYSTEM_PROMPT;
  const userMessage = isVariant
    ? `Here is the current page HTML. Create a completely different visual variant:\n\n${pageHtml}${docContext}${directionContext}\n\nOutput ONLY the new <section> HTML.`
    : `Current HTML:\n${pageHtml}\n\nInstruction: ${opts.instruction}${docContext}${directionContext}\n\nOutput ONLY the refined <section> HTML.`;

  const startTime = Date.now();
  const modelId = await getAiModel(isVariant ? "docRegeneratePage" : "docRefine");

  const result = streamText({
    model: resolveModelLocal(modelId, openaiKey || undefined, userKey || undefined),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 8000,
  });

  let fullHtml = "";
  for await (const chunk of result.textStream) {
    fullHtml += chunk;
  }

  // Extract section HTML
  const finalMatch = fullHtml.match(/<section[\s\S]*<\/section>/i);
  let finalHtml = finalMatch ? finalMatch[0] : fullHtml;

  // Sanitize colors
  finalHtml = sanitizeSemanticColors(finalHtml);

  // Enrich images
  const imageSlots = findImageSlots(finalHtml);
  if (imageSlots.length > 0) {
    finalHtml = await enrichImages(finalHtml, {
      pexelsApiKey: process.env.PEXELS_API_KEY,
      openaiApiKey: openaiKey || undefined,
    });
  }

  // Enrich SVG charts
  const svgRegex = /<div\s[^>]*data-svg-chart="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;
  const svgMatches: { fullMatch: string; prompt: string }[] = [];
  let svgM: RegExpExecArray | null;
  while ((svgM = svgRegex.exec(finalHtml)) !== null) {
    svgMatches.push({ fullMatch: svgM[0], prompt: svgM[1] });
  }
  if (svgMatches.length > 0) {
    const results = await Promise.allSettled(
      svgMatches.map(async ({ fullMatch, prompt }) => {
        try {
          const svg = await generateSvg(prompt, userKey || undefined);
          return { fullMatch, svg };
        } catch {
          return { fullMatch, svg: `<div class="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">${prompt}</div>` };
        }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        finalHtml = finalHtml.replace(r.value.fullMatch, r.value.svg);
      }
    }
  }

  // Update section in DB
  const updatedSections = sections.map((s) =>
    s.id === opts.sectionId ? { ...s, html: finalHtml } : s
  );
  await db.landing.update({ where: { id }, data: { sections: updatedSections as any } });

  // Log usage
  const usage = await result.usage;
  await incrementAiGeneration(ctx.user.id, undefined, {
    type: isVariant ? "variant" : "refine",
    product: "document",
    modelId,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    resourceId: id,
    durationMs: Date.now() - startTime,
  });

  return { html: finalHtml };
}

export async function refineDocumentSection(
  ctx: AuthContext,
  id: string,
  opts: { sectionId: string; instruction: string; direction?: DirectionOpts }
) {
  return _refineInternal(ctx, id, opts, false);
}

export async function regenerateDocumentPage(
  ctx: AuthContext,
  id: string,
  opts: { sectionId: string; direction?: DirectionOpts }
) {
  return _refineInternal(ctx, id, { ...opts, instruction: "VARIANT_MODE" }, true);
}
