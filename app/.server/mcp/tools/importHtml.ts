/**
 * import_html MCP tool handler.
 *
 * Takes any HTML source (Claude Design, Gamma, Tome, scraped page, etc.) and:
 *   1. Saves a raw copy to the user's file library (always).
 *   2. Normalizes arbitrary hex colors to semantic Tailwind tokens (optional).
 *   3. Runs the existing `sanitizeSemanticColors` pass for Tailwind classes.
 *   4. Creates a Document (Landing v4) with the normalized HTML as one section.
 *   5. Returns fileId + documentId + editorUrl + effective format.
 */

import { nanoid } from "nanoid";
import { sanitizeSemanticColors } from "../../sanitizeColors";
import type { AuthContext } from "../../apiAuth";
import { db } from "../../db";
import { getPlatformDefaultClient } from "../../storage";
import { createDocument } from "../../core/documentOperations";
import { normalizeHexColors } from "../importers/normalizeHexColors";

const PRESETS = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
  "letter": undefined, // stick to default Letter path (no custom format)
  "slide-16-9": { width: 1920, height: 1080 },
} as const;

type PresetKey = keyof typeof PRESETS;

export interface ImportHtmlInput {
  html: string;
  name?: string;
  destination?: "document";
  format?: {
    preset?: PresetKey;
    width?: number;
    height?: number;
  };
  brandKitId?: string;
  normalizeColors?: boolean;
  sourceUrl?: string;
}

function resolveFormat(input?: ImportHtmlInput["format"]): { width: number; height: number } | undefined {
  if (!input) return undefined;
  if (input.preset && input.preset !== "letter") {
    return PRESETS[input.preset];
  }
  if (input.preset === "letter") return undefined;
  if (typeof input.width === "number" && typeof input.height === "number") {
    if (input.width < 100 || input.width > 10000 || input.height < 100 || input.height > 10000) {
      return undefined;
    }
    return { width: input.width, height: input.height };
  }
  return undefined;
}

function siteBaseUrl(): string {
  return process.env.SITE_URL || "https://www.easybits.cloud";
}

async function saveRawHtmlToLibrary(
  ctx: AuthContext,
  html: string,
  name: string,
  sourceUrl?: string,
): Promise<string> {
  const client = getPlatformDefaultClient();
  const key = `${ctx.user.id}/import-${nanoid(8)}.html`;
  const buffer = Buffer.from(html, "utf-8");
  await client.putObject(key, buffer, "text/html; charset=utf-8");

  const file = await db.file.create({
    data: {
      name: `${name}.html`,
      storageKey: key,
      slug: key,
      size: buffer.length,
      contentType: "text/html",
      ownerId: ctx.user.id,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: null,
      ...(sourceUrl ? { source: sourceUrl } : {}),
    },
  });
  return file.id;
}

export async function importHtml(ctx: AuthContext, input: ImportHtmlInput) {
  const html = (input.html ?? "").trim();
  if (!html) {
    throw new Response(JSON.stringify({ error: "html is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (html.length > 2_000_000) {
    throw new Response(JSON.stringify({ error: "html too large (max 2MB)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = (input.name?.trim() || "Imported design").slice(0, 200);
  const destination = input.destination || "document";
  const format = resolveFormat(input.format);

  // 1. Save raw HTML to library (always).
  const fileId = await saveRawHtmlToLibrary(ctx, html, name, input.sourceUrl);

  // 2. Color normalization pipeline.
  let processedHtml = html;
  let colorNormResult: { replacements: number; roleMap: Record<string, string | undefined> } | null = null;
  if (input.normalizeColors !== false) {
    const r = normalizeHexColors(html);
    processedHtml = r.html;
    processedHtml = sanitizeSemanticColors(processedHtml);
    colorNormResult = { replacements: r.replacements, roleMap: r.roleMap as Record<string, string | undefined> };
  }

  if (destination === "document") {
    const section = {
      id: nanoid(12),
      order: 0,
      html: processedHtml,
      type: "imported",
      name: "Imported",
    };

    const doc = await createDocument(ctx, {
      name,
      sections: [section],
      brandKitId: input.brandKitId,
      format,
      sourceFileId: fileId,
      sourceUrl: input.sourceUrl,
    });

    return {
      fileId,
      documentId: doc.id,
      editorUrl: `${siteBaseUrl()}/dash/documents/${doc.id}`,
      format: format ?? null,
      colorNormalization: colorNormResult,
    };
  }

  // Fallback (shouldn't happen with MVP schema but defensive).
  return {
    fileId,
    documentId: null,
    editorUrl: null,
    format: format ?? null,
    colorNormalization: colorNormResult,
  };
}
