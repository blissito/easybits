import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { db } from "../db";
import { buildDeployHtmlV4 } from "~/lib/landing4/buildHtml";
import { buildDocumentPrintHtml } from "~/lib/documents/buildHtml";
import type { Section3 } from "~/lib/landing3/types";
import { replaceCdnWithCompiledCSS } from "../tailwind";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";
import { withPage, setContentAndWaitForAssets } from "./browserPool";
import { getPlatformPublicClient, buildPublicAssetUrl } from "../storage";
import { resolveLandingPaletteWithBrandKit } from "../themePalette";

/**
 * Server-rendered page thumbnails for the document editor's PageList. Replaces the old
 * client-side SVG-foreignObject→canvas capture (fragile: produced black/blank thumbs).
 * Renders a single page at a small scale via Playwright, identical to the PDF/export
 * pipeline, so the thumbnail matches the final output exactly.
 *
 * Cached in-memory by a hash of the render inputs — no Tigris churn. The key is the
 * content itself, so identical pages (or reloads within the instance lifetime) skip
 * the browser entirely.
 */
const thumbCache = new LRUCache<string, Buffer>({ max: 400 });

export async function takeDocumentThumbnail(
  userId: string,
  documentId: string,
  input: {
    sectionId: string;
    html: string;
    theme?: string;
    customColors?: Record<string, string> | null;
    format?: { width: number; height: number } | null;
    width?: number;
  }
): Promise<Buffer | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(documentId)) return null;

  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== userId || doc.version !== 4) return null;

  const format = input.format?.width && input.format?.height
    ? input.format
    : { width: 816, height: 1056 };
  const targetW = Math.max(120, Math.min(1200, Math.round(input.width ?? 400)));

  // Theme resolution mirrors the PDF/export path. Trust the editor's live theme/colors
  // (passed in) over DB so thumbnails don't lag behind unsaved theme switches.
  const docTheme = input.theme || doc.theme || (doc.metadata as any)?.theme;
  let themeCss: string | undefined;
  let tailwindConfig: string | undefined;
  if (docTheme === "custom") {
    const palette = input.customColors && Object.keys(input.customColors).length
      ? input.customColors
      : await resolveLandingPaletteWithBrandKit(doc);
    const t = buildCustomTheme(palette as any);
    themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
    tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
  } else {
    const docThemeCss = buildSingleThemeCss(docTheme || "default");
    themeCss = docThemeCss.css;
    tailwindConfig = docThemeCss.tailwindConfig;
  }

  const cacheKey = createHash("sha1")
    .update(JSON.stringify({ html: input.html, themeCss, tailwindConfig, format, targetW }))
    .digest("hex");
  const cached = thumbCache.get(cacheKey);
  if (cached) return cached;

  // `__grapes_css__` carries GrapesJS-added styles; include it for fidelity.
  const sections = (doc.sections as unknown as Section3[]) || [];
  const cssSections = sections.filter((s) => s.id === "__grapes_css__");
  const pageSection: Section3 = { id: input.sectionId, order: 0, html: input.html } as Section3;

  const scale = targetW / format.width;
  const clipH = Math.round(format.height * scale);

  const baseHtml = buildDocumentPrintHtml([...cssSections, pageSection], {
    themeCss,
    tailwindConfig,
    title: doc.name || "Document",
    format,
  });
  // Shrink the page to thumbnail size. The .page-section keeps its layout box at
  // format dims; the transform scales the pixels, and we clip to the scaled rect.
  const html = baseHtml.replace(
    "</head>",
    `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden;}
.page-section{transform:scale(${scale});transform-origin:top left;box-shadow:none!important;margin:0!important;}</style></head>`
  );
  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    const buffer = await withPage(async (page) => {
      await setContentAndWaitForAssets(page, optimizedHtml);
      return await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: targetW, height: clipH },
      });
    }, { viewport: { width: format.width, height: format.height } });
    thumbCache.set(cacheKey, buffer);
    return buffer;
  } catch (err: any) {
    console.error("[takeDocumentThumbnail] error:", err.message);
    return null;
  }
}

export async function takeDocumentScreenshot(
  userId: string,
  documentId: string,
  pageIndex = 0
): Promise<{ type: "image"; mimeType: "image/png"; data: string } | { type: "text"; text: string }> {
  if (!/^[0-9a-fA-F]{24}$/.test(documentId)) {
    return { type: "text", text: "Document not found" };
  }

  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== userId || doc.version !== 4) {
    return { type: "text", text: "Document not found" };
  }

  const sections = (doc.sections as unknown as Section3[]) || [];
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);

  if (contentSections.length === 0) {
    return { type: "text", text: "Document has no pages" };
  }

  if (pageIndex < 0 || pageIndex >= contentSections.length) {
    return { type: "text", text: `Invalid pageIndex: ${pageIndex}. Document has ${contentSections.length} page(s) (0-${contentSections.length - 1}).` };
  }

  const targetSection = contentSections[pageIndex];
  const cssSections = sections.filter((s) => s.id === "__grapes_css__");
  const pageSections = [...cssSections, targetSection];

  const metadata = doc.metadata as Record<string, any> | null;
  // Resolve palette server-side: handles legacy customColors shape (bg/surfaceAlt
  // keys) and falls back to the brand kit when customColors is missing entirely.
  const palette = await resolveLandingPaletteWithBrandKit(doc);
  const themeName = doc.theme || metadata?.theme;
  const html = buildDeployHtmlV4(pageSections, {
    showBranding: false,
    title: doc.name || "Document",
    themeName,
    customColors: themeName === "custom" ? palette : undefined,
  });

  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    return await withPage(async (page) => {
      await setContentAndWaitForAssets(page, optimizedHtml);
      const buffer = await page.screenshot({ type: "png" });
      return { type: "image" as const, mimeType: "image/png" as const, data: buffer.toString("base64") };
    });
  } catch (err: any) {
    return {
      type: "text" as const,
      text: `Screenshot unavailable: ${err.message}. This tool requires Chrome installed locally (designed for Claude Code MCP usage, not production).`,
    };
  }
}

/** Generate a PDF of the document (or a subset of its pages) using Playwright. Returns Buffer or null. */
export async function takeDocumentPdf(
  userId: string,
  documentId: string,
  opts: { sectionIds?: string[] } = {}
): Promise<Buffer | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(documentId)) return null;

  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== userId || doc.version !== 4) return null;

  const sections = (doc.sections as unknown as Section3[]) || [];
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);
  if (contentSections.length === 0) return null;

  // Optional subset: filter to requested section IDs, preserve the __grapes_css__ section so CSS is intact.
  const filteredContent = opts.sectionIds && opts.sectionIds.length > 0
    ? contentSections.filter((s) => opts.sectionIds!.includes(s.id))
    : contentSections;
  if (filteredContent.length === 0) return null;
  const cssSections = sections.filter((s) => s.id === "__grapes_css__");
  const sectionsForPrint = [...cssSections, ...filteredContent];

  const metadata = doc.metadata as Record<string, any> | null;
  const palettePdf = await resolveLandingPaletteWithBrandKit(doc);
  const docTheme = doc.theme || metadata?.theme;
  const customColors = docTheme === "custom" ? palettePdf : undefined;
  let themeCss: string | undefined;
  let tailwindConfig: string | undefined;

  if (customColors) {
    const t = buildCustomTheme(customColors as any);
    themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
    tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
  } else {
    const themeId = docTheme || "default";
    const docThemeCss = buildSingleThemeCss(themeId);
    themeCss = docThemeCss.css;
    tailwindConfig = docThemeCss.tailwindConfig;
  }

  const format = metadata?.format as { width: number; height: number } | undefined;
  const html = buildDocumentPrintHtml(sectionsForPrint, { themeCss, tailwindConfig, title: doc.name || "Document", format });
  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    return await withPage(async (page) => {
      await setContentAndWaitForAssets(page, optimizedHtml);
      if (format?.width && format?.height) {
        return await page.pdf({
          width: `${format.width}px`,
          height: `${format.height}px`,
          printBackground: true,
        });
      }
      // Detect landscape sections (w-[11in] h-[8.5in])
      const isLandscape = filteredContent.some((s) => s.html?.includes('w-[11in]'));
      return await page.pdf({ format: "Letter", printBackground: true, ...(isLandscape && { landscape: true }) });
    });
  } catch (err: any) {
    console.error("[takeDocumentPdf] error:", err.message);
    return null;
  }
}

/** Take an OG-sized screenshot (1200×630) of the cover page, scaled to fit */
export async function takeOgScreenshot(
  userId: string,
  documentId: string
): Promise<Buffer | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(documentId)) return null;

  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== userId || doc.version !== 4) return null;

  const sections = (doc.sections as unknown as Section3[]) || [];
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);
  if (contentSections.length === 0) return null;

  const cssSections = sections.filter((s) => s.id === "__grapes_css__");
  const pageSections = [...cssSections, contentSections[0]];

  const metadata = doc.metadata as Record<string, any> | null;
  const ogPalette = await resolveLandingPaletteWithBrandKit(doc);
  const ogThemeName = doc.theme || metadata?.theme;
  const html = buildDeployHtmlV4(pageSections, {
    showBranding: false,
    title: doc.name || "Document",
    themeName: ogThemeName,
    customColors: ogThemeName === "custom" ? ogPalette : undefined,
  });

  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  const scale = 1200 / 816;
  const ogHtml = optimizedHtml.replace(
    "</head>",
    `<style>
      body { margin: 0; overflow: hidden; }
      section { transform-origin: top left; transform: scale(${scale}); }
    </style></head>`
  );

  try {
    return await withPage(async (page) => {
      await setContentAndWaitForAssets(page, ogHtml);
      return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
    }, { viewport: { width: 1200, height: 630 } });
  } catch (err: any) {
    console.error("[takeOgScreenshot] error:", err.message);
    return null;
  }
}

/**
 * Export a document's pages as individual PNG files, uploaded to Tigris with
 * public URLs. Built for social carousels (LinkedIn/IG), where the platform
 * wants N images — not a single PDF. Each page is rendered in isolation at
 * the doc's stored format dimensions so the output is pixel-exact.
 */
export async function exportDocumentImages(
  userId: string,
  documentId: string,
  opts: { sectionIds?: string[] } = {}
): Promise<
  | { id: string; url: string; contentType: string; width: number; height: number; sectionId: string }[]
  | null
> {
  if (!/^[0-9a-fA-F]{24}$/.test(documentId)) return null;

  const doc = await db.landing.findUnique({ where: { id: documentId } });
  if (!doc || doc.ownerId !== userId || doc.version !== 4) return null;

  const sections = (doc.sections as unknown as Section3[]) || [];
  const contentSections = sections
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => a.order - b.order);
  if (contentSections.length === 0) return null;

  const filtered = opts.sectionIds && opts.sectionIds.length > 0
    ? contentSections.filter((s) => opts.sectionIds!.includes(s.id))
    : contentSections;
  if (filtered.length === 0) return null;

  const cssSections = sections.filter((s) => s.id === "__grapes_css__");

  const metadata = doc.metadata as Record<string, any> | null;
  const exportPalette = await resolveLandingPaletteWithBrandKit(doc);
  const docTheme = doc.theme || metadata?.theme;
  const customColors = docTheme === "custom" ? exportPalette : undefined;
  let themeCss: string | undefined;
  let tailwindConfig: string | undefined;
  if (customColors) {
    const t = buildCustomTheme(customColors as any);
    themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
    tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
  } else {
    const themeId = docTheme || "default";
    const docThemeCss = buildSingleThemeCss(themeId);
    themeCss = docThemeCss.css;
    tailwindConfig = docThemeCss.tailwindConfig;
  }

  const format = (metadata?.format as { width: number; height: number } | undefined)
    ?? { width: 816, height: 1056 };
  const client = getPlatformPublicClient();
  const safeName = (doc.name || "document").replace(/[^a-zA-Z0-9_\-. ]/g, "_").slice(0, 80);

  const results: { id: string; url: string; contentType: string; width: number; height: number; sectionId: string }[] = [];

  try {
    await withPage(async (page) => {
      for (let i = 0; i < filtered.length; i++) {
        const section = filtered[i];
        // Render this page in isolation so the screenshot is exactly format-sized.
        const html = buildDocumentPrintHtml(
          [...cssSections, section],
          { themeCss, tailwindConfig, title: doc.name || "Document", format },
        );
        const optimizedHtml = await replaceCdnWithCompiledCSS(html);
        await setContentAndWaitForAssets(page, optimizedHtml);
        const buffer = await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: format.width, height: format.height },
        });

        // Upload PNG to Tigris as a public file
        const storageKey = `${userId}/${nanoid(8)}.png`;
        await client.putObject(storageKey, buffer, "image/png");
        const publicUrl = buildPublicAssetUrl(storageKey);
        const file = await db.file.create({
          data: {
            name: `${safeName}-page-${i + 1}.png`,
            storageKey,
            slug: storageKey,
            size: buffer.length,
            contentType: "image/png",
            ownerId: userId,
            access: "public",
            url: publicUrl,
            status: "DONE",
            source: "mcp",
            metadata: { sourceDocumentId: documentId, sourceSectionId: section.id, pageIndex: i },
          },
        });
        results.push({
          id: file.id,
          url: publicUrl,
          contentType: "image/png",
          width: format.width,
          height: format.height,
          sectionId: section.id,
        });
      }
    }, { viewport: { width: format.width, height: format.height } });
  } catch (err: any) {
    console.error("[exportDocumentImages] error:", err.message);
    return null;
  }

  return results;
}
