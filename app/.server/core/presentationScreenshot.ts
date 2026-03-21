import { db } from "../db";
import { buildPresentationHtml } from "~/lib/presentation/buildHtml";
import type { Section3 } from "~/lib/landing3/types";
import { buildRevealHtml, type Slide } from "~/lib/buildRevealHtml";
import { replaceCdnWithCompiledCSS } from "../tailwind";

let browserPromise: ReturnType<typeof launchBrowser> | null = null;
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

export async function takeSlideScreenshot(
  userId: string,
  presentationId: string,
  slideIndex = 0
): Promise<{ type: "image"; mimeType: "image/png"; data: string } | { type: "text"; text: string }> {
  if (!/^[0-9a-fA-F]{24}$/.test(presentationId)) {
    return { type: "text", text: "Presentation not found" };
  }

  const pres = await db.presentation.findUnique({ where: { id: presentationId } });
  if (!pres || pres.ownerId !== userId) {
    return { type: "text", text: "Presentation not found" };
  }

  const slides = (pres.slides as unknown as Slide[]) || [];
  if (slides.length === 0) {
    return { type: "text", text: "Presentation has no slides" };
  }

  if (slideIndex < 0 || slideIndex >= slides.length) {
    return { type: "text", text: `Invalid slideIndex: ${slideIndex}. Presentation has ${slides.length} slide(s) (0-${slides.length - 1}).` };
  }

  // Build HTML for a single slide
  const slide = slides[slideIndex];
  const html = buildRevealHtml([{ ...slide, order: 0 }], pres.theme, (pres as any).paletteId, (pres as any).transition);

  return enqueueScreenshot(async () => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      try {
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 5000 }).catch(() => {});
        // Wait for reveal.js to initialize
        await page.waitForFunction(() => (window as any).Reveal?.isReady?.(), { timeout: 5000 }).catch(() => {});
        const buffer = await page.screenshot({ type: "png" });
        return { type: "image", mimeType: "image/png", data: buffer.toString("base64") } as const;
      } finally {
        await page.close();
      }
    } catch (err: any) {
      browserPromise = null;
      return {
        type: "text" as const,
        text: `Screenshot unavailable: ${err.message}. This tool requires Chrome installed locally.`,
      };
    }
  });
}
