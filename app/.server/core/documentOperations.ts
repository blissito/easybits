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
import { docEvents } from "./docEvents";
import type { Section3 } from "~/lib/landing3/types";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "../storage";

/** Upload a PDF buffer to storage and return a presigned read URL (1h) */
export async function uploadPdfToStorage(userId: string, pdf: Buffer, docName: string) {
  const client = getPlatformDefaultClient();
  const key = `${userId}/pdf-${crypto.randomUUID().slice(0, 8)}`;
  await client.putObject(key, pdf, "application/pdf");
  const readUrl = await client.getReadUrl(key);
  return { readUrl };
}

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validateObjectId(id: string): void {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throwJson("Document not found", 404);
}

export async function listDocuments(
  ctx: AuthContext,
  opts?: { limit?: number; offset?: number; search?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = opts?.offset ?? 0;
  const where: any = { ownerId: ctx.user.id, version: 4 };
  if (opts?.search) {
    where.name = { contains: opts.search, mode: "insensitive" };
  }
  const [items, total] = await Promise.all([
    db.landing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
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
    }),
    db.landing.count({ where }),
  ]);
  return {
    total,
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

export async function getDocument(
  ctx: AuthContext,
  id: string,
  opts?: { includeHtml?: boolean }
) {
  requireScope(ctx, "READ");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  if (opts?.includeHtml === false && Array.isArray(doc.sections)) {
    return {
      ...doc,
      sections: (doc.sections as any[]).map((s: any) => ({
        id: s.id,
        order: s.order,
        name: s.name,
        type: s.type,
      })),
    };
  }
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
    brandKitId?: string;
  }
) {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim();
  if (!name) throwJson("Name required", 400);

  const metadata: Record<string, unknown> = {};
  if (opts.theme) metadata.theme = opts.theme;

  // Brand kit → customColors + metadata.brandKitId
  if (opts.brandKitId) {
    const { getBrandKit } = await import("./brandKitOperations");
    const kit = await getBrandKit(opts.brandKitId, ctx.user.id);
    metadata.brandKitId = kit.id;
    if (!opts.customColors) {
      const c = kit.colors as any;
      metadata.customColors = { primary: c.primary, secondary: c.secondary, accent: c.accent, surface: c.surface };
    }
  }
  if (opts.customColors) metadata.customColors = opts.customColors;

  return db.landing.create({
    data: {
      name,
      prompt: opts.prompt || "",
      sections: (opts.sections ?? []) as any,
      version: 4,
      theme: metadata.customColors ? "custom" : (opts.theme || "default"),
      metadata: Object.keys(metadata).length > 0 ? metadata as any : undefined,
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
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const existing = (doc!.sections || []) as unknown as Array<Record<string, unknown>>;

  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.prompt !== undefined) updates.prompt = opts.prompt;
  if (opts.sections !== undefined) {
    // Anti-wipe guard: reject if all incoming sections lack html and existing doc has content
    const existingHasContent = existing.some((s: any) => s.html && s.html.length > 0);
    const allIncomingEmpty = opts.sections.every((s) => !s.html);
    if (existingHasContent && allIncomingEmpty && opts.sections.length > 0) {
      // Snapshot before allowing — likely a reorder, not a wipe
    }

    const merged = opts.sections.map((incoming: any) => {
      const found = existing.find((s: any) => s.id === incoming.id);
      // Strip undefined/null values from incoming so they don't overwrite existing
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (v !== undefined && v !== null && v !== "") clean[k] = v;
      }
      return { ...found, ...clean };
    });
    updates.sections = merged as any;

    // Save snapshot of previous sections for undo
    updates.previousSections = existing;
  }

  // Theme/customColors go in metadata
  if (opts.theme !== undefined || opts.customColors !== undefined) {
    const existing = (doc.metadata as Record<string, unknown>) || {};
    if (opts.theme !== undefined) existing.theme = opts.theme;
    if (opts.customColors !== undefined) existing.customColors = opts.customColors;
    if (opts.customColors && existing.theme !== "custom") existing.theme = "custom";
    updates.metadata = existing;
  }

  const result = await db.landing.update({ where: { id }, data: updates });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return result;
}

/** Update the full HTML of a single page in a document */
export async function setPageHtml(
  ctx: AuthContext,
  id: string,
  pageId: string,
  html: string
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const idx = sections.findIndex((s) => s.id === pageId);
  if (idx === -1) throwJson("Page not found", 404);

  const previousSections = JSON.parse(JSON.stringify(sections));
  sections[idx] = { ...sections[idx], html };
  const result = await db.landing.update({ where: { id }, data: { sections: sections as any, previousSections } });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return { success: true, pageId };
}

/** @deprecated Use setPageHtml instead */
export const setSectionHtml = setPageHtml;

/** Replace a specific HTML substring within a page (string-based, like Claude Code's edit model) */
export async function replaceHtmlInPage(
  ctx: AuthContext,
  id: string,
  pageId: string,
  oldHtml: string,
  newHtml: string
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const idx = sections.findIndex((s) => s.id === pageId);
  if (idx === -1) throwJson("Page not found", 404);

  const currentHtml = sections[idx].html || "";
  if (!currentHtml.includes(oldHtml)) {
    throwJson(
      `old_html not found in page. Use get_page_html to see the current HTML and copy the exact substring you want to replace.`,
      400
    );
  }

  const previousSections = JSON.parse(JSON.stringify(sections));
  const updatedHtml = currentHtml.replace(oldHtml, newHtml);
  sections[idx] = { ...sections[idx], html: updatedHtml };

  const result = await db.landing.update({
    where: { id },
    data: { sections: sections as any, previousSections },
  });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return { success: true, pageId };
}

/** Get the HTML and metadata of a single page */
export async function getPageHtml(
  ctx: AuthContext,
  id: string,
  pageId: string
) {
  requireScope(ctx, "READ");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const section = sections.find((s) => s.id === pageId);
  if (!section) throwJson("Page not found", 404);

  return section;
}

/** Get the outerHTML of a specific element within a page, matched by CSS selector */
export async function getSectionHtml(
  ctx: AuthContext,
  id: string,
  pageId: string,
  cssSelector: string
) {
  requireScope(ctx, "READ");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const section = sections.find((s) => s.id === pageId);
  if (!section) throwJson("Page not found", 404);

  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(section.html || "<section></section>");
  const el = dom.window.document.querySelector(cssSelector);
  if (!el) throwJson(`No element matches selector: ${cssSelector}`, 404);

  return { html: el.outerHTML, tagName: el.tagName.toLowerCase() };
}

/** Replace the outerHTML of a specific element within a page, matched by CSS selector */
export async function setSectionHtmlBySelector(
  ctx: AuthContext,
  id: string,
  pageId: string,
  cssSelector: string,
  html: string
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const idx = sections.findIndex((s) => s.id === pageId);
  if (idx === -1) throwJson("Page not found", 404);

  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(sections[idx].html || "<section></section>");
  const el = dom.window.document.querySelector(cssSelector);
  if (!el) throwJson(`No element matches selector: ${cssSelector}. Tip: use replace_html for string-based edits instead — it's more reliable for surgical changes.`, 404);

  // Parse new HTML in the same document context to avoid cross-document fragment issues
  const template = dom.window.document.createElement("template");
  template.innerHTML = html;
  el.replaceWith(template.content);

  // Serialize the updated page HTML
  const previousSections = JSON.parse(JSON.stringify(sections));
  const updatedHtml = dom.window.document.body.innerHTML;
  sections[idx] = { ...sections[idx], html: updatedHtml };
  const result = await db.landing.update({ where: { id }, data: { sections: sections as any, previousSections } });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return { success: true, pageId, cssSelector };
}

export async function addPage(
  ctx: AuthContext,
  id: string,
  opts: { html?: string; afterPageIndex?: number; label?: string }
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const previousSections = JSON.parse(JSON.stringify(sections));

  const newSection: Section3 = {
    id: crypto.randomUUID(),
    order: 0,
    html: opts.html || "<section class=\"w-[8.5in] h-[11in] flex flex-col relative overflow-hidden bg-surface\"><div class=\"flex-1 flex items-center justify-center text-on-surface-muted\">New page</div></section>",
    label: opts.label || `Page ${sections.length + 1}`,
  };

  const insertAt = opts.afterPageIndex !== undefined
    ? Math.min(opts.afterPageIndex + 1, sections.length)
    : sections.length;
  sections.splice(insertAt, 0, newSection);

  // Re-number orders
  sections.forEach((s, i) => { s.order = i; });

  const result = await db.landing.update({
    where: { id },
    data: { sections: sections as any, previousSections },
  });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return newSection;
}

export async function deletePage(
  ctx: AuthContext,
  id: string,
  pageId: string
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const idx = sections.findIndex((s) => s.id === pageId);
  if (idx === -1) throwJson("Page not found", 404);
  if (sections.length <= 1) throwJson("Cannot delete the last remaining page", 400);

  const previousSections = JSON.parse(JSON.stringify(sections));
  sections.splice(idx, 1);
  sections.forEach((s, i) => { s.order = i; });

  const result = await db.landing.update({
    where: { id },
    data: { sections: sections as any, previousSections },
  });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return { success: true, remainingPages: sections.length };
}

export async function reorderPages(
  ctx: AuthContext,
  id: string,
  pageIds: string[]
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const existingIds = new Set(sections.map((s) => s.id));
  const inputIds = new Set(pageIds);

  if (pageIds.length !== sections.length || pageIds.some((id) => !existingIds.has(id)) || existingIds.size !== inputIds.size)
    throwJson("pageIds must contain every existing page ID exactly once", 400);

  const previousSections = JSON.parse(JSON.stringify(sections));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const reordered = pageIds.map((pid, i) => {
    const s = sectionMap.get(pid)!;
    return { ...s, order: i };
  });

  const result = await db.landing.update({
    where: { id },
    data: { sections: reordered as any, previousSections },
  });
  docEvents.emit("doc:changed", { id, sections: result.sections, updatedAt: result.updatedAt });
  return reordered.map((s) => ({ id: s.id, order: s.order, label: s.label }));
}

export async function deleteDocument(ctx: AuthContext, id: string) {
  requireScope(ctx, "DELETE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  await db.landing.delete({ where: { id } });
  return { success: true };
}

export async function deployDocument(ctx: AuthContext, id: string) {
  validateObjectId(id);
  // Validate it's a document before delegating
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  return deployLanding(ctx, id);
}

export async function unpublishDocument(ctx: AuthContext, id: string) {
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);
  return unpublishLanding(ctx, id);
}

// --- Document Enhance ---

export async function enhanceDocumentPrompt(
  ctx: AuthContext,
  opts: { name: string; prompt?: string; action?: "enhance" | "auto-describe" }
) {
  requireScope(ctx, "READ");
  const { generateText } = await import("ai");
  const { getAiModel, resolveModelLocal } = await import("../aiModels");
  const { logAiUsage } = await import("../aiGenerationLimit");

  const action = opts.action || (opts.prompt ? "enhance" : "auto-describe");

  if (action === "auto-describe") {
    if (!opts.name) throw new Error("Name required");
    const modelId = await getAiModel("docAutoDescribe");
    const model = resolveModelLocal(modelId);
    const { text, usage } = await generateText({
      model,
      system: `You are a creative assistant. Given a document title, write a brief description (2-3 sentences in Spanish) of what the document should contain and how it should look. Be specific about content structure and design style. Do NOT add greetings or explanations, just the description.`,
      prompt: `Document title: "${opts.name}"\n\nWrite a brief description for this document:`,
    });
    logAiUsage(ctx.user.id, { type: "enhance", product: "document", modelId, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens });
    return { description: text.trim() };
  }

  if (!opts.prompt) throw new Error("Prompt required");
  const modelId = await getAiModel("docDirections");
  const model = resolveModelLocal(modelId);
  const { text, usage } = await generateText({
    model,
    system: `You are a creative director helping a user write better instructions for an AI document generator.
The user will give you a brief description of what they want. Your job is to enhance it into a detailed, actionable prompt that will produce a beautiful, professional document.

RULES:
- Keep the user's original intent intact
- Add specific design suggestions (colors, layout, typography style)
- Suggest content structure (sections, charts, tables if relevant)
- Keep it under 3-4 sentences, concise but rich
- Write in Spanish
- Do NOT add greetings or explanations, just the improved prompt
- If the user mentions data/numbers, suggest visualizations`,
    prompt: `Document name: "${opts.name}"
User's description: "${opts.prompt}"

Write an enhanced version of this description:`,
  });
  logAiUsage(ctx.user.id, { type: "enhance", product: "document", modelId, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens });
  return { enhanced: text.trim() };
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

export async function uploadLogoToStorage(dataUrl: string, userId: string): Promise<string> {
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
    referenceImage?: string;
    skipCover?: boolean;
    pageFormat?: "letter" | "web";
    brandKitId?: string;
  }
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) throwJson(`Generation limit reached (${genLimit.limit}/month). Upgrade or buy a pack at https://www.easybits.cloud/planes`, 429);

  // Resolve brand kit → direction + logo
  let direction = opts.direction;
  let logoUrl = opts.logoUrl;
  if (opts.brandKitId && !direction) {
    const { getBrandKit, brandKitToDirection } = await import("./brandKitOperations");
    const kit = await getBrandKit(opts.brandKitId, ctx.user.id);
    direction = brandKitToDirection(kit);
    if (!logoUrl && kit.logoUrl) logoUrl = kit.logoUrl;
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;
  const resolvedLogoUrl = logoUrl ? await uploadLogoToStorage(logoUrl, ctx.user.id) : undefined;

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
    referenceImage: opts.referenceImage,
    extraInstructions: opts.extraInstructions,
    direction: direction as any,
    pexelsApiKey: process.env.PEXELS_API_KEY,
    model: docModel,
    outlineModel,
    pageCount: opts.pageCount,
    skipCover: !!opts.skipCover,
    pageFormat: opts.pageFormat,
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

// --- Template System (data-slot) ---

export async function getTemplateSlots(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const { JSDOM } = await import("jsdom");
  const slots: Array<{ slot: string; currentValue: string; pageId: string; pageIndex: number }> = [];

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.html) continue;
    const dom = new JSDOM(s.html);
    const els = dom.window.document.querySelectorAll("[data-slot]");
    for (const el of els) {
      slots.push({
        slot: el.getAttribute("data-slot")!,
        currentValue: el.textContent || "",
        pageId: s.id,
        pageIndex: i,
      });
    }
  }

  return { documentId: id, slots };
}

export async function fillTemplate(
  ctx: AuthContext,
  id: string,
  data: Record<string, string>
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const { JSDOM } = await import("jsdom");
  let filledSlots = 0;

  for (const s of sections) {
    if (!s.html) continue;
    const dom = new JSDOM(s.html);
    const els = dom.window.document.querySelectorAll("[data-slot]");
    let changed = false;
    for (const el of els) {
      const key = el.getAttribute("data-slot")!;
      if (key in data) {
        el.textContent = data[key];
        filledSlots++;
        changed = true;
      }
    }
    if (changed) {
      s.html = dom.window.document.body.innerHTML;
    }
  }

  await db.landing.update({ where: { id }, data: { sections: sections as any } });
  docEvents.emit("doc:changed", { id, sections, updatedAt: new Date() });

  return { filledSlots, totalDataKeys: Object.keys(data).length };
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
  opts: { sectionId: string; instruction?: string; direction?: DirectionOpts; pageFormat?: "letter" | "web" },
  isVariant: boolean
) {
  requireScope(ctx, "WRITE");
  validateObjectId(id);
  const doc = await db.landing.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4)
    throwJson("Document not found", 404);

  const sections = (doc.sections || []) as unknown as Section3[];
  const section = sections.find((s) => s.id === opts.sectionId);
  if (!section) throwJson("Section not found", 404);

  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) throwJson(`Generation limit reached (${genLimit.limit}/month). Upgrade or buy a pack at https://www.easybits.cloud/planes`, 429);

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

  const pageHtml = section.html || "<section></section>";
  const docContext = doc.prompt ? `\n\nDOCUMENT CONTEXT: ${doc.prompt}` : "";

  // Direction context
  let directionContext = "";
  if (opts.direction?.headingFont || opts.direction?.bodyFont) {
    const d = opts.direction;
    const colors = (d.colors || {}) as Record<string, string>;
    directionContext = `\n\nDESIGN DIRECTION:
- Mood: ${d.mood || "professional"}
- Layout hint: ${d.layoutHint || "clean and structured"}
- Heading font: ${d.headingFont} (inline style)
- Body font: ${d.bodyFont} (inline style)
- Colors: primary=${colors.primary || "N/A"}, accent=${colors.accent || "N/A"}, surface=${colors.surface || "N/A"}`;
  }

  const isWeb = opts.pageFormat === "web";
  let systemPrompt = isVariant ? VARIANT_SYSTEM_PROMPT : REFINE_SYSTEM_PROMPT;
  if (isWeb) {
    systemPrompt = systemPrompt
      .replace(/letter-sized \(8\.5" × 11"\)/g, "web-optimized (1280px wide, flexible height)")
      .replace(/w-\[8\.5in\] h-\[11in\]/g, "w-[1280px] min-h-[800px]")
      .replace(/EXACTLY 11in tall — content MUST fit, never exceed/g, "flexible height — content determines the height, use min-h-[800px]")
      .replace(/7" × 9\.5" effective area with 0\.75" margins/g, "comfortable padding for web reading");
  }
  const userMessage = isVariant
    ? `Here is the current page HTML. Create a completely different visual variant:\n\n${pageHtml}${docContext}${directionContext}\n\nOutput ONLY the new <section> HTML.`
    : `Current HTML:\n${pageHtml}\n\nInstruction: ${opts.instruction}${docContext}${directionContext}\n\nOutput ONLY the refined <section> HTML.`;

  const startTime = Date.now();
  const modelId = await getAiModel(isVariant ? "docRegeneratePage" : "docRefine");

  const result = streamText({
    model: resolveModelLocal(modelId, openaiKey || undefined, userKey || undefined),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 8000,
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
  opts: { sectionId: string; instruction: string; direction?: DirectionOpts; pageFormat?: "letter" | "web" }
) {
  return _refineInternal(ctx, id, opts, false);
}

export async function regenerateDocumentPage(
  ctx: AuthContext,
  id: string,
  opts: { sectionId: string; direction?: DirectionOpts; pageFormat?: "letter" | "web" }
) {
  return _refineInternal(ctx, id, { ...opts, instruction: "VARIANT_MODE" }, true);
}

export async function createDocumentFromCFDI(
  ctx: AuthContext,
  opts: { xml: string; theme?: string; customColors?: Record<string, string> }
) {
  requireScope(ctx, "WRITE");
  const { parseCFDI } = await import("~/lib/cfdi/parseCFDI");
  const { buildCFDIDocument } = await import("~/lib/cfdi/templates");

  const data = parseCFDI(opts.xml);
  const html = buildCFDIDocument(data);

  const tipoNames: Record<string, string> = { I: "Factura", P: "Recibo de Pago", E: "Nota de Crédito", T: "Carta Porte", N: "Nómina" };
  const name = `${tipoNames[data.tipo] || "CFDI"} — ${data.emisor.nombre || data.emisor.rfc}${data.serie || data.folio ? ` (${[data.serie, data.folio].filter(Boolean).join(" ")})` : ""}`;

  const sectionId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const sections = [{ id: sectionId, order: 0, html, type: "content", name: tipoNames[data.tipo] || "CFDI" }];

  const metadata: Record<string, unknown> = { cfdi: { uuid: data.timbre?.uuid, tipo: data.tipo, emisorRfc: data.emisor.rfc, receptorRfc: data.receptor.rfc, total: data.total, moneda: data.moneda, fecha: data.fecha } };
  if (opts.theme) metadata.theme = opts.theme;
  if (opts.customColors) metadata.customColors = opts.customColors;

  const doc = await db.landing.create({
    data: {
      name,
      prompt: `CFDI ${data.tipoDesc} — ${data.emisor.nombre} → ${data.receptor.nombre}`,
      sections: sections as any,
      version: 4,
      theme: opts.theme || "default",
      metadata: metadata as any,
      ownerId: ctx.user.id,
    },
  });

  return { ...doc, cfdiData: data };
}

export async function createQuotation(
  ctx: AuthContext,
  opts: {
    name: string;
    pages?: string[];
    data?: QuotationData;
    theme?: string;
    customColors?: Record<string, string>;
    brandKitId?: string;
  }
) {
  requireScope(ctx, "WRITE");

  let pages: string[];
  if (opts.data) {
    const { buildQuotationHTML, fixQuotationMath } = await import("~/lib/quotation/templates");
    fixQuotationMath(opts.data);
    pages = buildQuotationHTML(opts.data);
  } else if (opts.pages?.length) {
    pages = opts.pages;
  } else {
    throw new Error("Either structured data or HTML pages are required");
  }

  const metadata = {
    ...(opts.theme && { theme: opts.theme }),
    ...(opts.customColors && { customColors: opts.customColors }),
    ...(opts.brandKitId && { brandKitId: opts.brandKitId }),
  };

  const doc = await db.landing.create({
    data: {
      name: opts.name,
      prompt: opts.name,
      sections: buildSections(pages, "Cotización") as any,
      version: 4,
      theme: opts.theme || "corporate",
      metadata: metadata as any,
      ownerId: ctx.user.id,
    },
  });

  // Generate PDF via Playwright (no deploy, no S3)
  const { takeDocumentPdf } = await import("./documentScreenshot");
  const pdf = await takeDocumentPdf(ctx.user.id, doc.id);

  return { document: doc, pdf };
}

// ─── Structured document helpers ─────────────────────────────────────

function buildSections(pages: string[], defaultName: string) {
  return pages.map((html, i) => ({
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    order: i,
    html,
    type: "content",
    name: i === 0 ? defaultName : `Página ${i + 1}`,
  }));
}

async function createStructuredDoc(
  ctx: AuthContext,
  opts: { name: string; prompt: string; pages: string[]; sectionName: string; theme?: string; customColors?: Record<string, string> }
) {
  requireScope(ctx, "WRITE");
  if (!opts.pages.length) throw new Error("At least one page is required");

  const metadata = {
    ...(opts.theme && { theme: opts.theme }),
    ...(opts.customColors && { customColors: opts.customColors }),
  };

  const doc = await db.landing.create({
    data: {
      name: opts.name,
      prompt: opts.prompt,
      sections: buildSections(opts.pages, opts.sectionName) as any,
      version: 4,
      theme: opts.theme || "minimal",
      metadata: metadata as any,
      ownerId: ctx.user.id,
    },
  });

  const { takeDocumentPdf } = await import("./documentScreenshot");
  const pdf = await takeDocumentPdf(ctx.user.id, doc.id);
  return { document: doc, pdf };
}

async function editStructuredDoc(
  ctx: AuthContext,
  opts: { documentId: string; pages: string[]; sectionName: string; name?: string }
) {
  requireScope(ctx, "WRITE");
  const doc = await db.landing.findUnique({ where: { id: opts.documentId } });
  if (!doc || doc.ownerId !== ctx.user.id) throw new Error("Document not found");

  const sections = buildSections(opts.pages, opts.sectionName);
  const updated = await db.landing.update({
    where: { id: opts.documentId },
    data: {
      sections: sections as any,
      ...(opts.name && { name: opts.name }),
    },
  });

  const { takeDocumentPdf } = await import("./documentScreenshot");
  const pdf = await takeDocumentPdf(ctx.user.id, updated.id);
  return { document: updated, pdf };
}

// ─── Edit Quotation ──────────────────────────────────────────────────

import type { QuotationData } from "~/lib/quotation/templates";

export async function editQuotation(
  ctx: AuthContext,
  opts: { documentId: string; data: QuotationData; name?: string }
) {
  const { buildQuotationHTML, fixQuotationMath } = await import("~/lib/quotation/templates");
  fixQuotationMath(opts.data);
  const pages = buildQuotationHTML(opts.data);
  return editStructuredDoc(ctx, {
    documentId: opts.documentId,
    pages,
    sectionName: "Cotización",
    name: opts.name,
  });
}

// ─── Screening Reports ───────────────────────────────────────────────

import type { ScreeningReportData } from "~/lib/screening/templates";

export async function createScreeningReport(
  ctx: AuthContext,
  opts: { data: ScreeningReportData; name?: string; theme?: string; customColors?: Record<string, string> }
) {
  const { buildScreeningReportHTML } = await import("~/lib/screening/templates");
  const html = buildScreeningReportHTML(opts.data);
  const name = opts.name || `Reporte Screening — ${opts.data.subject.name}`;
  return createStructuredDoc(ctx, {
    name,
    prompt: `Reporte screening ${opts.data.riskLevel === "none" ? "negativo" : opts.data.riskLevel} — ${opts.data.subject.name}`,
    pages: [html],
    sectionName: "Reporte",
    theme: opts.theme || "minimal",
    customColors: opts.customColors,
  });
}

export async function editScreeningReport(
  ctx: AuthContext,
  opts: { documentId: string; data: ScreeningReportData; name?: string }
) {
  const { buildScreeningReportHTML } = await import("~/lib/screening/templates");
  const html = buildScreeningReportHTML(opts.data);
  return editStructuredDoc(ctx, {
    documentId: opts.documentId,
    pages: [html],
    sectionName: "Reporte",
    name: opts.name,
  });
}

// ─── GEO Scorecards ─────────────────────────────────────────────────

import type { GeoScorecardData } from "~/lib/geo/templates";

export async function createGeoScorecard(
  ctx: AuthContext,
  opts: { data: GeoScorecardData; name?: string; theme?: string; customColors?: Record<string, string> }
) {
  const { buildGeoScorecardHTML } = await import("~/lib/geo/templates");
  const pages = buildGeoScorecardHTML(opts.data);
  const name = opts.name || `GEO Scorecard — ${opts.data.domain}`;
  return createStructuredDoc(ctx, {
    name,
    prompt: `GEO Scorecard ${opts.data.domain} — ${opts.data.overallScore}/${opts.data.maxScore || 10}`,
    pages,
    sectionName: "Scorecard",
    theme: opts.theme || "minimal",
    customColors: opts.customColors,
  });
}

export async function editGeoScorecard(
  ctx: AuthContext,
  opts: { documentId: string; data: GeoScorecardData; name?: string }
) {
  const { buildGeoScorecardHTML } = await import("~/lib/geo/templates");
  const pages = buildGeoScorecardHTML(opts.data);
  return editStructuredDoc(ctx, {
    documentId: opts.documentId,
    pages,
    sectionName: "Scorecard",
    name: opts.name,
  });
}

// ─── Tournament Schedules ───────────────────────────────────────────

import type { TournamentScheduleData } from "~/lib/tournament/templates";

/** Build pages from structured data — supports single-day or multi-day via `days` array */
async function buildTournamentPages(
  data: TournamentScheduleData & { days?: Array<{ gameDate: string; matches: TournamentScheduleData["matches"] }> }
): Promise<string[]> {
  const { buildTournamentScheduleHTML } = await import("~/lib/tournament/templates");
  if (data.days?.length) {
    // Multi-day: generate one page per day, sharing common fields
    return data.days.map((day) =>
      buildTournamentScheduleHTML({ ...data, gameDate: day.gameDate, matches: day.matches })
    );
  }
  // Single day
  return [buildTournamentScheduleHTML(data)];
}

export async function createTournamentSchedule(
  ctx: AuthContext,
  opts: { data?: TournamentScheduleData & { days?: Array<{ gameDate: string; matches: TournamentScheduleData["matches"] }> }; pages?: string[]; name?: string }
) {
  let pages: string[];
  if (opts.pages?.length) {
    pages = opts.pages;
  } else if (opts.data) {
    pages = await buildTournamentPages(opts.data);
  } else {
    throw new Error("Either 'matches' (structured data) or 'pages' (raw HTML) is required");
  }
  const name = opts.name || (opts.data ? `Calendario — ${opts.data.tournamentName}` : "Calendario de torneo");
  const prompt = opts.data ? `Calendario ${opts.data.tournamentName}` : name;
  return createStructuredDoc(ctx, {
    name,
    prompt,
    pages,
    sectionName: "Calendario",
    theme: "minimal",
  });
}

export async function editTournamentSchedule(
  ctx: AuthContext,
  opts: { documentId: string; data?: TournamentScheduleData & { days?: Array<{ gameDate: string; matches: TournamentScheduleData["matches"] }> }; pages?: string[]; name?: string }
) {
  let pages: string[];
  if (opts.pages?.length) {
    pages = opts.pages;
  } else if (opts.data) {
    pages = await buildTournamentPages(opts.data);
  } else {
    throw new Error("Either 'matches' (structured data) or 'pages' (raw HTML) is required");
  }
  return editStructuredDoc(ctx, {
    documentId: opts.documentId,
    pages,
    sectionName: "Calendario",
    name: opts.name,
  });
}
