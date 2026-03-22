/**
 * Convert PDF pages to base64 PNG images using Playwright + pdf.js.
 * Detects each page's native dimensions and renders at correct aspect ratio.
 */

let browserPromise: ReturnType<typeof launchBrowser> | null = null;
let pdfQueue: Promise<any> = Promise.resolve();

function enqueuePdfJob<T>(fn: () => Promise<T>): Promise<T> {
  const result = pdfQueue.then(fn, fn);
  pdfQueue = result.catch(() => {});
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

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155";

export interface PdfPage {
  image: string; // base64 PNG
  width: number; // rendered pixel width
  height: number; // rendered pixel height
}

/**
 * Convert PDF to images. Returns page images with their native dimensions.
 * @param maxWidth - max render width (default 1200). Height is calculated from PDF aspect ratio.
 */
export async function pdfToImages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; maxWidth?: number } = {}
): Promise<PdfPage[]> {
  const { maxPages = 20, maxWidth = 1200 } = opts;

  const html = `<!DOCTYPE html>
<html><head></head><body>
<canvas id="canvas"></canvas>
<script type="module">
  import * as pdfjsLib from "${PDFJS_CDN}/pdf.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_CDN}/pdf.worker.min.mjs";

  async function render(pdfBytes, maxPages, maxW) {
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const total = Math.min(pdf.numPages, maxPages);
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const results = [];

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      // Scale to fit maxWidth, preserve aspect ratio
      const scale = Math.min(maxW / vp.width, 2.0); // cap at 2x
      const viewport = page.getViewport({ scale });
      const w = Math.round(viewport.width);
      const h = Math.round(viewport.height);
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport }).promise;
      results.push({
        image: canvas.toDataURL("image/png").split(",")[1],
        width: w,
        height: h,
      });
    }
    return results;
  }

  window.__renderPdf = render;
</script></body></html>`;

  return enqueuePdfJob(async () => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width: maxWidth, height: maxWidth } });
      try {
        await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForFunction(() => typeof (window as any).__renderPdf === "function", { timeout: 15000 });

        const b64 = pdfBuffer.toString("base64");
        const results = await page.evaluate(
          async ({ b64, maxPages, maxW }) => {
            const binary = atob(b64);
            const uint8 = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);
            return (window as any).__renderPdf(uint8, maxPages, maxW);
          },
          { b64, maxPages, maxW: maxWidth }
        );

        return results as PdfPage[];
      } finally {
        await page.close();
      }
    } catch (err: any) {
      browserPromise = null;
      throw new Error(`PDF rendering failed: ${err.message}`);
    }
  });
}
