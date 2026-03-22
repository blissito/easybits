/**
 * Convert PDF pages to base64 PNG images using Playwright + pdf.js.
 * Renders each page to canvas at presentation dimensions (960x540).
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

export async function pdfToImages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; width?: number; height?: number } = {}
): Promise<string[]> {
  const { maxPages = 20, width = 960, height = 540 } = opts;

  // Minimal page that loads pdf.js and waits for data via window.__pdfBytes
  const html = `<!DOCTYPE html>
<html><head></head><body>
<canvas id="canvas"></canvas>
<script type="module">
  import * as pdfjsLib from "${PDFJS_CDN}/pdf.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_CDN}/pdf.worker.min.mjs";

  async function render(pdfBytes, maxPages, w, h) {
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const total = Math.min(pdf.numPages, maxPages);
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const results = [];

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(w / vp.width, h / vp.height);
      const viewport = page.getViewport({ scale });
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const offsetX = (w - viewport.width) / 2;
      const offsetY = (h - viewport.height) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);
      await page.render({ canvasContext: ctx, viewport }).promise;
      ctx.restore();
      results.push(canvas.toDataURL("image/png").split(",")[1]);
    }
    return results;
  }

  window.__renderPdf = render;
</script></body></html>`;

  return enqueuePdfJob(async () => {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
        // Wait for the render function to be available
        await page.waitForFunction(() => typeof (window as any).__renderPdf === "function", { timeout: 15000 });

        // Pass PDF bytes via evaluate (chunked transfer, avoids inline HTML bloat)
        const results = await page.evaluate(
          async ({ bytes, maxPages, w, h }) => {
            const uint8 = new Uint8Array(bytes);
            return (window as any).__renderPdf(uint8, maxPages, w, h);
          },
          { bytes: Array.from(pdfBuffer), maxPages, w: width, h: height }
        );

        return results as string[];
      } finally {
        await page.close();
      }
    } catch (err: any) {
      browserPromise = null;
      throw new Error(`PDF rendering failed: ${err.message}`);
    }
  });
}
