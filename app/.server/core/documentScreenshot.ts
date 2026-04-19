import { db } from "../db";
import { buildDeployHtmlV4 } from "~/lib/landing4/buildHtml";
import { buildDocumentPrintHtml } from "~/lib/documents/buildHtml";
import type { Section3 } from "~/lib/landing3/types";
import { replaceCdnWithCompiledCSS } from "../tailwind";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";
import { withPage } from "./browserPool";

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
  const html = buildDeployHtmlV4(pageSections, {
    showBranding: false,
    title: doc.name || "Document",
    themeName: metadata?.theme,
    customColors: metadata?.customColors,
  });

  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    return await withPage(async (page) => {
      await page.setContent(optimizedHtml, { waitUntil: "networkidle" });
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

/** Generate a PDF of the entire document using Playwright. Returns Buffer or null. */
export async function takeDocumentPdf(
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

  const metadata = doc.metadata as Record<string, any> | null;
  const docTheme = metadata?.theme;
  const customColors = metadata?.customColors;
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
  const html = buildDocumentPrintHtml(sections, { themeCss, tailwindConfig, title: doc.name || "Document", format });
  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    return await withPage(async (page) => {
      await page.setContent(optimizedHtml, { waitUntil: "networkidle" });
      if (format?.width && format?.height) {
        return await page.pdf({
          width: `${format.width}px`,
          height: `${format.height}px`,
          printBackground: true,
        });
      }
      // Detect landscape sections (w-[11in] h-[8.5in])
      const isLandscape = contentSections.some((s) => s.html?.includes('w-[11in]'));
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
  const html = buildDeployHtmlV4(pageSections, {
    showBranding: false,
    title: doc.name || "Document",
    themeName: metadata?.theme,
    customColors: metadata?.customColors,
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
      await page.setContent(ogHtml, { waitUntil: "networkidle" });
      return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
    }, { viewport: { width: 1200, height: 630 } });
  } catch (err: any) {
    console.error("[takeOgScreenshot] error:", err.message);
    return null;
  }
}
