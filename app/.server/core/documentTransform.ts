/**
 * Document transformations that touch metadata + optionally trigger
 * regeneration. Two flagship operations for chat-style editing:
 *
 *   - applyBrandKit: swap brand kit on a doc. Cheap by default (metadata
 *     only — semantic Tailwind classes re-render automatically). Pass
 *     regenerate:true to also have the AI rethink each page's layout
 *     under the new mood.
 *
 *   - changeDocumentFormat: change the canvas (e.g., letter → slide-16-9).
 *     Regenerates all pages by default since stale `w-[Xpx]` classes would
 *     otherwise visually break in the new canvas.
 */
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { db } from "../db";
import { resolveBrandKit, brandKitToDirection } from "./brandKitOperations";
import { regenerateDocumentPage } from "./documentOperations";
import {
  resolveFormat,
  detectIntent,
  type SocialPresetKey,
  type FormatInput,
} from "./socialPresets";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface DocSection {
  id: string;
  order?: number;
  html?: string;
  type?: string;
  name?: string;
}

async function ownDoc(ctx: AuthContext, documentId: string) {
  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4) {
    throwJson("Document not found", 404);
  }
  return doc;
}

/**
 * Run regenerateDocumentPage serially over every content section. Failures
 * on one page don't abort — the doc ends up partially regenerated and the
 * caller gets a `failedSections` array so they can retry.
 */
async function regenerateAllPages(
  ctx: AuthContext,
  documentId: string,
  direction?: ReturnType<typeof brandKitToDirection>
): Promise<{ regenerated: number; failed: { sectionId: string; error: string }[] }> {
  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc) return { regenerated: 0, failed: [] };
  const sections = ((doc.sections || []) as unknown as DocSection[]).filter(
    (s) => s.id && s.id !== "__grapes_css__"
  );

  let ok = 0;
  const failed: { sectionId: string; error: string }[] = [];
  for (const s of sections) {
    try {
      await regenerateDocumentPage(ctx, documentId, {
        sectionId: s.id,
        direction,
      });
      ok++;
    } catch (e: any) {
      const msg =
        e instanceof Response
          ? `${e.status}`
          : e?.message || String(e);
      failed.push({ sectionId: s.id, error: msg });
    }
  }
  return { regenerated: ok, failed };
}

export interface ApplyBrandKitOpts {
  documentId: string;
  brandKitId?: string; // falls back to user's default
  regenerate?: boolean; // default false — semantic classes do the heavy lifting
}

export async function applyBrandKit(ctx: AuthContext, opts: ApplyBrandKitOpts) {
  requireScope(ctx, "WRITE");
  await ownDoc(ctx, opts.documentId);

  const kit = await resolveBrandKit(ctx.user.id, opts.brandKitId);
  if (!kit) throwJson("No brand kit found (none specified and no default)", 404);

  const direction = brandKitToDirection(kit);
  const customColors = {
    bg: direction.colors.surface,
    accent: direction.colors.accent,
    text: direction.colors.text,
    primary: direction.colors.primary,
    surfaceAlt: direction.colors.surfaceAlt,
  };

  const fresh = await db.landing.findUnique({ where: { id: opts.documentId } });
  const meta = (fresh?.metadata as Record<string, unknown>) || {};
  const newMeta = {
    ...meta,
    brandKitId: kit.id,
    customColors,
    direction: {
      mood: direction.mood,
      headingFont: direction.headingFont,
      bodyFont: direction.bodyFont,
    },
  };

  await db.landing.update({
    where: { id: opts.documentId },
    data: {
      theme: "custom",
      customColors: customColors as any,
      metadata: newMeta as any,
    },
  });

  let regenResult: { regenerated: number; failed: { sectionId: string; error: string }[] } | null = null;
  if (opts.regenerate) {
    regenResult = await regenerateAllPages(ctx, opts.documentId, direction);
  }

  return {
    documentId: opts.documentId,
    brandKitId: kit.id,
    brandKitName: kit.name,
    regenerated: regenResult,
    note: opts.regenerate
      ? "Brand kit applied and pages regenerated."
      : "Brand kit applied (metadata only). Pages re-render with new theme automatically thanks to semantic classes. Pass regenerate:true to have the AI rethink layouts under the new mood.",
  };
}

export interface ChangeDocumentFormatOpts {
  documentId: string;
  pageFormat: SocialPresetKey | FormatInput;
  regenerate?: boolean; // default true — without regen, stale pixel classes break visually
}

export async function changeDocumentFormat(
  ctx: AuthContext,
  opts: ChangeDocumentFormatOpts
) {
  requireScope(ctx, "WRITE");
  await ownDoc(ctx, opts.documentId);

  const formatInput: FormatInput =
    typeof opts.pageFormat === "string"
      ? { preset: opts.pageFormat as SocialPresetKey }
      : opts.pageFormat;
  const { format, intent } = resolveFormat(formatInput);

  const fresh = await db.landing.findUnique({ where: { id: opts.documentId } });
  const meta = (fresh?.metadata as Record<string, unknown>) || {};
  const newMeta: Record<string, unknown> = { ...meta };
  if (format) {
    newMeta.format = format;
    newMeta.intent = intent || detectIntent(format);
  } else {
    // letter / undefined → drop format so renderer falls through to default
    delete newMeta.format;
    delete newMeta.intent;
  }

  await db.landing.update({
    where: { id: opts.documentId },
    data: { metadata: newMeta as any },
  });

  const shouldRegen = opts.regenerate !== false; // default true
  let regenResult: { regenerated: number; failed: { sectionId: string; error: string }[] } | null = null;
  if (shouldRegen) {
    regenResult = await regenerateAllPages(ctx, opts.documentId);
  }

  return {
    documentId: opts.documentId,
    format: format || null,
    intent: newMeta.intent || "document",
    regenerated: regenResult,
    note: shouldRegen
      ? "Format changed and pages regenerated for the new canvas."
      : "Format metadata changed. Pages still use the old pixel classes — call regenerate_document_page on each section, or rerun with regenerate:true.",
  };
}

/**
 * Server-side wait. Polls the document until a "ready" condition fires
 * (configurable: minSections lets the caller block until at least N
 * sections exist) or timeout elapses.
 */
export interface WaitForDocumentOpts {
  documentId: string;
  minSections?: number; // default 1
  timeoutMs?: number; // default 60000, max 120000
  pollIntervalMs?: number; // default 1500
}

export async function waitForDocument(ctx: AuthContext, opts: WaitForDocumentOpts) {
  requireScope(ctx, "READ");
  const minSections = opts.minSections ?? 1;
  const timeoutMs = Math.min(opts.timeoutMs ?? 60_000, 120_000);
  const pollIntervalMs = Math.max(opts.pollIntervalMs ?? 1500, 500);

  const start = Date.now();
  let lastCount = -1;
  let lastUpdatedAt: Date | null = null;

  while (Date.now() - start < timeoutMs) {
    const doc = await db.landing.findUnique({ where: { id: opts.documentId } });
    if (!doc || doc.ownerId !== ctx.user.id || doc.version !== 4) {
      throwJson("Document not found", 404);
    }
    const sections = ((doc.sections || []) as unknown as DocSection[]).filter(
      (s) => s.id !== "__grapes_css__"
    );
    const count = sections.length;
    const updatedAt = doc.updatedAt;

    // "Ready" heuristic: enough sections AND no recent updates in the last
    // pollInterval (i.e., background loop appears to have stopped writing).
    const stable = lastUpdatedAt !== null && updatedAt.getTime() === lastUpdatedAt.getTime();
    if (count >= minSections && stable) {
      return {
        documentId: opts.documentId,
        ready: true,
        sectionCount: count,
        elapsedMs: Date.now() - start,
      };
    }

    lastCount = count;
    lastUpdatedAt = updatedAt;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return {
    documentId: opts.documentId,
    ready: false,
    sectionCount: lastCount,
    elapsedMs: Date.now() - start,
    note: "Timed out — document still generating. Call again or check get_document.",
  };
}
