import { db } from "../db";
import { buildDeployHtmlV4 } from "~/lib/landing4/buildHtml";
import type { Section3 } from "~/lib/landing3/types";
import { replaceCdnWithCompiledCSS } from "../tailwind";

let browserPromise: ReturnType<typeof launchBrowser> | null = null;

// Semaphore: max 1 concurrent screenshot to avoid overloading the server
let screenshotQueue: Promise<any> = Promise.resolve();

function enqueueScreenshot<T>(fn: () => Promise<T>): Promise<T> {
  const result = screenshotQueue.then(fn, fn);
  screenshotQueue = result.catch(() => {});
  return result;
}

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

function getBrowser() {
  if (!browserPromise) browserPromise = launchBrowser();
  return browserPromise;
}

export async function takeDocumentScreenshot(
  userId: string,
  documentId: string,
  pageIndex = 0
): Promise<{ type: "image"; mimeType: "image/png"; data: string } | { type: "text"; text: string }> {
  // Validate ID
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

  // Build HTML for the target page only
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

  // Compile Tailwind server-side — eliminates CDN download + browser JIT
  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  return enqueueScreenshot(async () => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
      try {
        await page.setContent(optimizedHtml, { waitUntil: "domcontentloaded" });
        // Wait for fonts to load (fast — only network request left after Tailwind compilation)
        await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 5000 }).catch(() => {});
        const buffer = await page.screenshot({ type: "png" });
        return { type: "image", mimeType: "image/png", data: buffer.toString("base64") } as const;
      } finally {
        await page.close();
      }
    } catch (err: any) {
      browserPromise = null;
      return {
        type: "text" as const,
        text: `Screenshot unavailable: ${err.message}. This tool requires Chrome installed locally (designed for Claude Code MCP usage, not production).`,
      };
    }
  });
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

  // Scale letter page (816px) to 1200px wide, clip to 630px tall for OG ratio
  const scale = 1200 / 816;
  const ogHtml = optimizedHtml.replace(
    "</head>",
    `<style>
      body { margin: 0; overflow: hidden; }
      section { transform-origin: top left; transform: scale(${scale}); }
    </style></head>`
  );

  return enqueueScreenshot(async () => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
      try {
        await page.setContent(ogHtml, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 5000 }).catch(() => {});
        return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
      } finally {
        await page.close();
      }
    } catch (err: any) {
      browserPromise = null;
      console.error("[takeOgScreenshot] error:", err.message);
      return null;
    }
  });
}
