import { createHash } from "node:crypto";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { deployLanding, unpublishLanding } from "./landingOperations";
import { resolveAiKey } from "./aiKeyOperations";
import { checkAiGenerationLimit, incrementAiGeneration } from "../aiGenerationLimit";
import { getAiModel, resolveModelLocal } from "../aiModels";
import { generateDocumentParallel } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import { GAMMA_LAYOUTS } from "@easybits.cloud/html-tailwind-generator/directions";
import { streamText } from "ai";
import { enrichImages, findImageSlots, generateSvg } from "@easybits.cloud/html-tailwind-generator/images";
import { sanitizeSemanticColors } from "../sanitizeColors";
import { docEvents } from "./docEvents";
import type { Section3 } from "~/lib/landing3/types";
import { getPlatformDefaultClient, getPlatformPublicClient, buildPublicAssetUrl } from "../storage";
import logger from "../logger";

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

const SECTION_COMPARE_KEYS = ["id", "html", "order", "name", "type", "label"] as const;

/**
 * Structural equality of two sections arrays.
 * Returns true when every comparable field matches at every index, so callers
 * can skip a DB write + auto-deploy when the agent re-sent identical state.
 */
function sectionsEqual(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const li = left[i] ?? {};
    const ri = right[i] ?? {};
    for (const key of SECTION_COMPARE_KEYS) {
      if ((li[key] ?? "") !== (ri[key] ?? "")) return false;
    }
  }
  return true;
}

function htmlHash(html: string | undefined | null): string {
  return createHash("sha256").update(html ?? "").digest("hex");
}

function logNoop(tool: string, documentId: string, reason: string) {
  logger.info("mcp.noop.detected", { tool, documentId, reason });
}

/**
 * Build the public share URL for a deployed website. Mirrors the logic at the
 * end of `deployLanding` so MCP responses give agents a URL they can hit
 * without having to deploy again.
 */
export function buildShareUrl(slug: string, subdomainEnabled: boolean): string {
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.NODE_ENV === "production" ? "www.easybits.cloud" : "localhost:3000";
  return subdomainEnabled
    ? `${proto}://${slug}.easybits.cloud`
    : `${proto}://${host}/s/${slug}/`;
}

/**
 * Look up the public share info (slug + shareUrl + pdfUrl) for a document, or
 * return null if it has no live website. Resolves the case where the doc has a
 * `websiteId` but the website is soft-deleted — treats that as not deployed.
 * pdfUrl is read from the `sites/<id>/document.pdf` file record (set by
 * deployLanding for v4 documents) and is null when no PDF was generated.
 */
async function getShareInfo(
  websiteId: string | null,
  ownerId: string
): Promise<{ slug: string; shareUrl: string; pdfUrl: string | null; subdomainEnabled: boolean } | null> {
  if (!websiteId) return null;
  const website = await db.website.findUnique({
    where: { id: websiteId },
    select: { slug: true, status: true, subdomainEnabled: true },
  });
  if (!website || website.status === "DELETED") return null;
  const pdfFile = await db.file.findFirst({
    where: {
      name: `sites/${websiteId}/document.pdf`,
      ownerId,
      status: { not: "DELETED" },
    },
    select: { url: true },
  });
  return {
    slug: website.slug,
    shareUrl: buildShareUrl(website.slug, website.subdomainEnabled),
    pdfUrl: pdfFile?.url ?? null,
    subdomainEnabled: website.subdomainEnabled,
  };
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

  // Resolve share info in a single batched query — avoids N+1 round-trips.
  const websiteIds = items.map((d) => d.websiteId).filter((x): x is string => !!x);
  const [websites, pdfFiles] = websiteIds.length
    ? await Promise.all([
        db.website.findMany({
          where: { id: { in: websiteIds } },
          select: { id: true, slug: true, status: true, subdomainEnabled: true },
        }),
        db.file.findMany({
          where: {
            ownerId: ctx.user.id,
            status: { not: "DELETED" },
            name: { in: websiteIds.map((id) => `sites/${id}/document.pdf`) },
          },
          select: { name: true, url: true },
        }),
      ])
    : [[], []];
  const websiteMap = new Map(websites.map((w) => [w.id, w]));
  const pdfUrlByWebsiteId = new Map(
    pdfFiles.map((f) => {
      const m = f.name.match(/^sites\/([^/]+)\/document\.pdf$/);
      return [m?.[1] ?? "", f.url] as [string, string | null];
    })
  );

  return {
    total,
    items: items.map((d) => {
      const w = d.websiteId ? websiteMap.get(d.websiteId) : null;
      const isLive = w && w.status !== "DELETED";
      return {
        id: d.id,
        name: d.name,
        prompt: d.prompt,
        theme: (d.metadata as any)?.theme || d.theme,
        status: d.status,
        websiteId: d.websiteId,
        slug: isLive ? w!.slug : null,
        shareUrl: isLive ? buildShareUrl(w!.slug, w!.subdomainEnabled) : null,
        pdfUrl: isLive ? pdfUrlByWebsiteId.get(d.websiteId!) ?? null : null,
        pageCount: Array.isArray(d.sections) ? d.sections.length : 0,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    }),
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

  const share = await getShareInfo(doc.websiteId, ctx.user.id);
  const shareFields = {
    slug: share?.slug ?? null,
    shareUrl: share?.shareUrl ?? null,
    pdfUrl: share?.pdfUrl ?? null,
  };

  if (opts?.includeHtml === false && Array.isArray(doc.sections)) {
    return {
      ...doc,
      ...shareFields,
      sections: (doc.sections as any[]).map((s: any) => ({
        id: s.id,
        order: s.order,
        name: s.name,
        type: s.type,
        label: s.label,
        htmlLength: (s.html ?? "").length,
        htmlHash: htmlHash(s.html),
      })),
    };
  }
  return { ...doc, ...shareFields };
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
    format?: { width: number; height: number };
    sourceFileId?: string;
    sourceUrl?: string;
    intent?: "social" | "presentation" | "document";
  }
) {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim();
  if (!name) throwJson("Name required", 400);

  const metadata: Record<string, unknown> = {};
  if (opts.theme) metadata.theme = opts.theme;
  if (opts.format) metadata.format = opts.format;
  if (opts.sourceFileId) metadata.sourceFileId = opts.sourceFileId;
  if (opts.sourceUrl) metadata.sourceUrl = opts.sourceUrl;
  if (opts.intent) metadata.intent = opts.intent;

  // Brand kit → customColors + metadata.brandKitId.
  // Fallback: if no brandKitId and no customColors, auto-apply user's default kit.
  const kit = opts.customColors
    ? null
    : await (await import("./brandKitOperations")).resolveBrandKit(ctx.user.id, opts.brandKitId);
  if (kit) {
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

  // Theme/customColors go in metadata. Copy before mutating so doc.metadata
  // stays untouched and the no-op check below can compare old vs new state.
  if (opts.theme !== undefined || opts.customColors !== undefined) {
    const original = (doc.metadata as Record<string, unknown>) || {};
    const next: Record<string, unknown> = { ...original };
    if (opts.theme !== undefined) next.theme = opts.theme;
    if (opts.customColors !== undefined) next.customColors = opts.customColors;
    if (opts.customColors && next.theme !== "custom") next.theme = "custom";
    updates.metadata = next;
  }

  // No-op guard: skip DB write + autoDeploy when nothing actually changed
  const noChanges =
    (updates.name === undefined || updates.name === doc.name) &&
    (updates.prompt === undefined || updates.prompt === doc.prompt) &&
    (updates.sections === undefined || sectionsEqual(updates.sections as any[], existing as any[])) &&
    (updates.metadata === undefined ||
      JSON.stringify(updates.metadata) === JSON.stringify(doc.metadata ?? {}));
  if (noChanges) {
    logNoop("update_document", id, "no fields changed");
    return { ...doc, noop: true, reason: "no fields changed" } as any;
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

  if ((sections[idx].html ?? "") === html) {
    logNoop("set_page_html", id, "html unchanged");
    return { success: true, noop: true, reason: "html unchanged", pageId };
  }

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

  const updatedHtml = currentHtml.replace(oldHtml, newHtml);
  if (updatedHtml === currentHtml) {
    logNoop("replace_html", id, "replacement produced identical html");
    return { success: true, noop: true, reason: "replacement produced identical html", pageId };
  }

  const previousSections = JSON.parse(JSON.stringify(sections));
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
  const updatedHtml = dom.window.document.body.innerHTML;
  if ((sections[idx].html ?? "") === updatedHtml) {
    logNoop("set_section_html", id, "selector replacement produced identical html");
    return { success: true, noop: true, reason: "selector replacement produced identical html", pageId, cssSelector };
  }
  const previousSections = JSON.parse(JSON.stringify(sections));
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
  // Identity
  name?: string;
  tagline?: string;

  // Audience & voice (Gamma's biggest quality lever)
  audience?: string;
  voice?: string;

  // Typography
  headingFont?: string;
  bodyFont?: string;
  /** Mandatory pixel sizes per role — forces consistency across all pages.
   *  When set (typically from a brand kit), every regenerate uses these EXACT sizes. */
  typographyScale?: {
    h1?: string;
    h2?: string;
    h3?: string;
    body?: string;
    label?: string;
    caption?: string;
  };

  // Color & mood
  colors?: { primary: string; accent: string; surface: string; surfaceAlt: string; text: string };
  mood?: string;

  // Layout & visual system (Base44 "styling instructions templates")
  layoutHint?: string;
  layoutPreset?:
    | "cover" | "section-divider" | "agenda" | "big-statement"
    | "one-big-stat" | "stat-grid" | "two-column" | "three-column"
    | "image-full-bleed" | "image-text-split" | "bento-grid" | "card-grid"
    | "comparison-table" | "timeline-vertical" | "process-steps"
    | "quote" | "closing-cta";
  density?: "spacious" | "comfortable" | "compact" | "dense-editorial";
  borderRadius?: "sharp" | "soft" | "rounded" | "pill";
  shadows?: "none" | "subtle" | "soft" | "dramatic";

  // Imagery (callout in research)
  imageryStyle?: string;

  // Content discipline (Gamma "max 15 words per bullet, active voice")
  contentDiscipline?: string;

  // Reference brands ("looks like Stripe / Linear / Vercel")
  referenceBrands?: string[];

  // Free-form override (Base44 styling instructions templates / Replit vibe)
  customInstructions?: string;
}

function buildDirectionContext(d?: DirectionOpts): string {
  if (!d) return "";
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  const anyField =
    has(d.name) || has(d.tagline) || has(d.audience) || has(d.voice) ||
    has(d.headingFont) || has(d.bodyFont) || has(d.typographyScale) ||
    has(d.colors) || has(d.mood) ||
    has(d.layoutHint) || has(d.layoutPreset) || has(d.density) || has(d.borderRadius) || has(d.shadows) ||
    has(d.imageryStyle) || has(d.contentDiscipline) ||
    (d.referenceBrands && d.referenceBrands.length > 0) || has(d.customInstructions);
  if (!anyField) return "";

  const c = (d.colors || {}) as Record<string, string>;
  const lines: string[] = ["", "DESIGN DIRECTION:"];

  if (d.name) lines.push(`- Name: ${d.name}${d.tagline ? ` — ${d.tagline}` : ""}`);
  else if (d.tagline) lines.push(`- Tagline: ${d.tagline}`);
  if (d.audience) lines.push(`- Audience: ${d.audience}`);
  if (d.voice) lines.push(`- Voice / tone: ${d.voice}`);
  if (d.mood) lines.push(`- Mood: ${d.mood}`);
  if (d.layoutHint) lines.push(`- Layout hint: ${d.layoutHint}`);
  if (d.layoutPreset) {
    const recipe = GAMMA_LAYOUTS[d.layoutPreset];
    if (recipe) lines.push(`- Layout preset (FOLLOW THIS RECIPE EXACTLY): "${d.layoutPreset}" — ${recipe}`);
  }
  if (d.density) lines.push(`- Density: ${d.density}`);
  if (d.headingFont) lines.push(`- Heading font: ${d.headingFont} (inline style on ALL headings)`);
  if (d.bodyFont) lines.push(`- Body font: ${d.bodyFont} (inline style on ALL body text)`);
  if (d.typographyScale) {
    const s = d.typographyScale;
    const parts: string[] = [];
    if (s.h1) parts.push(`h1=${s.h1}`);
    if (s.h2) parts.push(`h2=${s.h2}`);
    if (s.h3) parts.push(`h3=${s.h3}`);
    if (s.body) parts.push(`body=${s.body}`);
    if (s.label) parts.push(`label=${s.label}`);
    if (s.caption) parts.push(`caption=${s.caption}`);
    if (parts.length > 0) {
      lines.push(`- TYPOGRAPHY SCALE (mandatory — use these EXACT sizes via inline style="font-size: Xpx", NO improvisation): ${parts.join(", ")}`);
    }
  }
  if (d.borderRadius) lines.push(`- Border radius: ${d.borderRadius}`);
  if (d.shadows) lines.push(`- Shadows: ${d.shadows}`);
  if (d.imageryStyle) lines.push(`- Imagery style: ${d.imageryStyle}`);
  if (d.contentDiscipline) lines.push(`- Content discipline: ${d.contentDiscipline}`);
  if (d.referenceBrands && d.referenceBrands.length > 0)
    lines.push(`- Reference brands (take design cues from): ${d.referenceBrands.join(", ")}`);
  if (has(c.primary) || has(c.accent) || has(c.surface)) {
    lines.push(
      `- Colors: primary=${c.primary || "N/A"}, accent=${c.accent || "N/A"}, surface=${c.surface || "N/A"}, surfaceAlt=${c.surfaceAlt || "N/A"}, text=${c.text || "N/A"}`
    );
    lines.push(
      `- COLOR RULE (mandatory): The page MUST use these exact hex values via Tailwind arbitrary classes (bg-[${c.primary || "#..."}], text-[${c.text || "#..."}], etc.) OR the project's semantic tokens (bg-primary, text-on-surface). DO NOT invent new colors regardless of any layout/style hints above.`
    );
  }
  if (d.customInstructions) lines.push(`- Custom instructions: ${d.customInstructions}`);

  return "\n" + lines.join("\n");
}

export async function uploadLogoToStorage(dataUrl: string, userId: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const buffer = Buffer.from(match[2], "base64");
  const ext = match[1].includes("png") ? "png" : match[1].includes("svg") ? "svg" : "webp";
  const key = `logos/${userId}/${crypto.randomUUID()}.${ext}`;
  const client = getPlatformPublicClient();
  const putUrl = await client.getPutUrl(key, { timeout: 60 });
  await fetch(putUrl, { method: "PUT", body: buffer, headers: { "Content-Type": match[1] } });
  return buildPublicAssetUrl(key);
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

  // Resolve brand kit → direction + logo.
  // Fallback: if no brandKitId and no explicit direction, auto-apply user's default kit.
  let direction = opts.direction;
  let logoUrl = opts.logoUrl;
  if (!direction) {
    const { resolveBrandKit, brandKitToDirection } = await import("./brandKitOperations");
    const kit = await resolveBrandKit(ctx.user.id, opts.brandKitId);
    if (kit) {
      direction = brandKitToDirection(kit);
      if (!logoUrl && kit.logoUrl) logoUrl = kit.logoUrl;
    }
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

/**
 * Customize the base system prompt for the page format the doc was created with.
 *
 *   - `letter` (no docFormat) → unchanged, uses the original letter-based prompt.
 *   - `web` (legacy isWeb flag) → swap letter strings for web-optimized values.
 *   - Custom dims (`docFormat={width,height}`) → swap section sizing to pixels and
 *     add a FULL-BLEED block when the intent is "social" (Stories/feed/square).
 *   - 16:9 presentations → swap to slide-style instructions.
 *
 * The base prompts (`VARIANT_SYSTEM_PROMPT`, `REFINE_SYSTEM_PROMPT`) are written
 * for letter — this function adapts them in place rather than duplicating prompts.
 */
export function buildSystemPrompt(
  basePrompt: string,
  docFormat: { width: number; height: number } | undefined,
  docIntent: "social" | "presentation" | "document" | undefined,
  isWeb: boolean,
): string {
  if (isWeb && !docFormat) {
    return basePrompt
      .replace(/letter-sized \(8\.5" × 11"\)/g, "web-optimized (1280px wide, flexible height)")
      .replace(/w-\[8\.5in\] h-\[11in\]/g, "w-[1280px] min-h-[800px]")
      .replace(/EXACTLY 11in tall — content MUST fit, never exceed/g, "flexible height — content determines the height, use min-h-[800px]")
      .replace(/7" × 9\.5" effective area with 0\.75" margins/g, "comfortable padding for web reading");
  }

  if (!docFormat) return basePrompt;

  const { width, height } = docFormat;
  const dims = `${width}×${height}px`;
  const sectionClass = `w-[${width}px] h-[${height}px]`;

  let prompt = basePrompt
    .replace(/letter-sized \(8\.5" × 11"\)/g, `social/marketing format (${dims})`)
    .replace(/w-\[8\.5in\] h-\[11in\]/g, sectionClass)
    .replace(/EXACTLY 11in tall — content MUST fit, never exceed/g, `EXACTLY ${height}px tall — content MUST fit the entire frame, never exceed`)
    .replace(/7" × 9\.5" effective area with 0\.75" margins/g, `the entire ${dims} frame — design FULL-BLEED, no letter margins`);

  if (docIntent === "social") {
    prompt += `

FULL-BLEED FORMAT — ${dims}:
- This is a social media artifact (IG/LinkedIn/Stories), NOT a letter document
- Design EDGE-TO-EDGE: the <section> must fill the entire ${dims} frame visually
- Use a full-bleed background (bg-primary, bg-gradient-to-br, bg-surface, etc.) covering 100% of the section
- NO letter-style 0.75in margins. Use generous internal padding (px-12, py-16) but the colored background reaches all four edges
- Typography: dramatic scale (text-6xl/text-7xl for headlines), generous breathing room
- Single focal hierarchy: hero title + supporting text, optional small chips/icons row at bottom
- Centered or asymmetric composition — but visually "filled" so it works as a standalone post
- For 9:16 vertical (Stories/Reels): stack content vertically with strong visual rhythm; safe zones at top/bottom
- For 1:1 square: balanced composition, the eye should land on the headline first
- For 4:5 portrait (IG feed): hero up top, supporting blocks below`;
  } else if (docIntent === "presentation") {
    prompt += `

PRESENTATION SLIDE — ${dims} (16:9):
- Design as a single slide, not a document page
- Centered hero composition, minimal chrome, large-scale typography
- Use the entire ${dims} frame — no letter margins
- One main idea per slide`;
  }

  return prompt;
}

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
  const directionContext = buildDirectionContext(opts.direction);

  // Read format/intent from doc metadata so social/presentation docs get
  // format-aware prompts (1080×1920 Stories, 1080×1350 IG feed, etc.)
  // instead of letter-based ones. Falls back to letter when absent.
  const meta = (doc.metadata || {}) as Record<string, unknown>;
  const docFormat = meta.format as { width: number; height: number } | undefined;
  const docIntent = meta.intent as "social" | "presentation" | "document" | undefined;
  const isWeb = opts.pageFormat === "web";
  const basePrompt = isVariant ? VARIANT_SYSTEM_PROMPT : REFINE_SYSTEM_PROMPT;
  const systemPrompt = buildSystemPrompt(basePrompt, docFormat, docIntent, isWeb);
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

  // Safety net: if the doc has explicit pixel dimensions but Gemini still emitted
  // letter classes (`w-[8.5in] h-[11in]`), force-replace them. The prompt should
  // already steer Gemini, but this guarantees the section matches the frame.
  if (docFormat) {
    const dimClass = `w-[${docFormat.width}px] h-[${docFormat.height}px]`;
    finalHtml = finalHtml.replace(/w-\[8\.5in\]\s+h-\[11in\]/g, dimClass);
  }

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

  // Auto-apply user's default kit if no brandKitId and no customColors.
  const kit = opts.customColors
    ? null
    : await (await import("./brandKitOperations")).resolveBrandKit(ctx.user.id, opts.brandKitId);
  const kitColors = kit ? (kit.colors as any) : null;
  const metadata: Record<string, unknown> = {
    ...(opts.theme && { theme: opts.theme }),
    ...(opts.customColors
      ? { customColors: opts.customColors }
      : kitColors && {
          customColors: {
            primary: kitColors.primary,
            secondary: kitColors.secondary,
            accent: kitColors.accent,
            surface: kitColors.surface,
          },
        }),
    ...(kit && { brandKitId: kit.id }),
  };

  const doc = await db.landing.create({
    data: {
      name: opts.name,
      prompt: opts.name,
      sections: buildSections(pages, "Cotización") as any,
      version: 4,
      theme: opts.customColors || kitColors ? "custom" : (opts.theme || "corporate"),
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
