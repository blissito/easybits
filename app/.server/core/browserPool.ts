/**
 * Shared browser pool for Playwright operations (screenshots, PDFs).
 * Single Chromium instance shared across documents and presentations.
 * Semaphore-based concurrency (default 3, configurable via BROWSER_POOL_SIZE).
 */
import type { Browser, Page } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;
let pageCount = 0;
const MAX_PAGES_BEFORE_RESTART = 100;
const POOL_SIZE = parseInt(process.env.BROWSER_POOL_SIZE || "3", 10);

// Simple semaphore for concurrency control
let running = 0;
const waitQueue: Array<() => void> = [];

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    pageCount = 0;
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

function resetBrowser() {
  const old = browserPromise;
  browserPromise = null;
  pageCount = 0;
  if (old) old.then((b) => b.close().catch(() => {}));
}

/**
 * Run a function with a Playwright page from the shared pool.
 * Handles concurrency, browser lifecycle, and error recovery.
 */
export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  opts?: { viewport?: { width: number; height: number } }
): Promise<T> {
  // Acquire semaphore slot
  if (running >= POOL_SIZE) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  running++;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage({
      viewport: opts?.viewport || { width: 816, height: 1056 },
    });
    try {
      const result = await fn(page);
      pageCount++;
      // Auto-restart browser after N pages to prevent memory bloat
      if (pageCount >= MAX_PAGES_BEFORE_RESTART) {
        resetBrowser();
      }
      return result;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    resetBrowser();
    throw err;
  } finally {
    running--;
    const next = waitQueue.shift();
    if (next) next();
  }
}

/**
 * Render HTML in the page and wait until ALL assets are loaded — both `<img>`
 * elements AND CSS `background-image: url(...)` references. Playwright's
 * `networkidle` is unreliable for the latter because browsers fetch CSS bg
 * images lazily on paint, sometimes after the 500ms quiet window. Also waits
 * for `document.fonts.ready` so Google Fonts / `@font-face` finish loading.
 *
 * Per-asset timeout caps each load at 8s so a single dead URL can't hang the
 * whole export.
 *
 * Use this instead of `page.setContent(html, { waitUntil: "networkidle" })`
 * in any export pipeline.
 */
export async function setContentAndWaitForAssets(
  page: Page,
  html: string,
  opts?: { perAssetTimeoutMs?: number }
): Promise<void> {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async (timeoutMs) => {
    const withTimeout = (p: Promise<unknown>) =>
      Promise.race([p, new Promise((r) => setTimeout(r, timeoutMs))]);

    // (1) <img> elements
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : withTimeout(
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              })
            )
      )
    );

    // (2) CSS background-image URLs (browser fetches lazily on paint)
    const els = Array.from(document.querySelectorAll<HTMLElement>("*"));
    const urls = new Set<string>();
    for (const el of els) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") continue;
      for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const u = m[1];
        if (u && !u.startsWith("data:")) urls.add(u);
      }
    }
    await Promise.all(
      Array.from(urls).map((url) =>
        withTimeout(
          new Promise<void>((resolve) => {
            const probe = new Image();
            probe.addEventListener("load", () => resolve(), { once: true });
            probe.addEventListener("error", () => resolve(), { once: true });
            probe.src = url;
          })
        )
      )
    );

    // (3) document.fonts — wait for any pending @font-face / Google Fonts loads
    if ((document as any).fonts?.ready) {
      await withTimeout((document as any).fonts.ready);
    }
  }, opts?.perAssetTimeoutMs ?? 8000);
}

/**
 * Downscale + recompress oversized `<img>` elements to their rendered display
 * box before exporting to PDF/PNG. Chromium embeds source-resolution image bytes
 * regardless of CSS display size, so a 528KB PNG shown at 40px stayed 528KB —
 * bloating PDFs to 5–9MB and tripping container timeouts. This measures each
 * image's laid-out box, refetches the source, resizes to box × `factor` (for
 * print sharpness) with sharp, recompresses to WebP, and swaps the `src` for a
 * data URL in place. Per-image failures leave the original `src` untouched.
 *
 * Call AFTER setContentAndWaitForAssets and BEFORE page.pdf()/page.screenshot().
 * Set DISABLE_EXPORT_IMAGE_OPT=1 to bypass.
 */
export async function optimizePageImages(
  page: Page,
  opts?: { factor?: number; maxDimension?: number; quality?: number; maxConcurrent?: number }
): Promise<void> {
  if (process.env.DISABLE_EXPORT_IMAGE_OPT === "1") return;

  const factor = opts?.factor ?? 2;
  const maxDimension = opts?.maxDimension ?? 2000;
  const quality = opts?.quality ?? 80;
  const maxConcurrent = opts?.maxConcurrent ?? 6;

  const candidates = await page.evaluate(() =>
    Array.from(document.images).map((img, idx) => {
      const r = img.getBoundingClientRect();
      return {
        idx,
        src: img.currentSrc || img.src,
        displayW: Math.round(r.width),
        displayH: Math.round(r.height),
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
      };
    })
  );

  // Only touch remote raster images whose source is meaningfully bigger than the
  // box they render in. Skip data:/blob:/relative, SVG (vector), and hidden imgs.
  const targetLongestOf = (displayW: number, displayH: number) =>
    Math.min(maxDimension, Math.round(Math.max(displayW, displayH) * factor));
  const targets = candidates.filter((c) => {
    if (!c.src || !/^https?:\/\//i.test(c.src)) return false;
    if (/\.svg(\?|#|$)/i.test(c.src)) return false;
    if (c.displayW < 1 || c.displayH < 1) return false;
    if (c.naturalW < 1 || c.naturalH < 1) return false;
    return Math.max(c.naturalW, c.naturalH) > targetLongestOf(c.displayW, c.displayH) * 1.15;
  });
  if (targets.length === 0) return;

  const sharp = (await import("sharp")).default;
  const replacements: { idx: number; dataUrl: string }[] = [];

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const c = targets[cursor++];
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        let buf: Buffer;
        try {
          const res = await fetch(c.src, { signal: ctrl.signal });
          if (!res.ok) continue;
          if ((res.headers.get("content-type") || "").includes("svg")) continue;
          buf = Buffer.from(await res.arrayBuffer());
        } finally {
          clearTimeout(timer);
        }
        const longest = targetLongestOf(c.displayW, c.displayH);
        const resize = c.naturalW >= c.naturalH
          ? { width: longest, withoutEnlargement: true }
          : { height: longest, withoutEnlargement: true };
        const out = await sharp(buf, { failOn: "none" })
          .rotate()
          .resize(resize)
          .webp({ quality })
          .toBuffer();
        // Don't swap if recompression didn't actually shrink the bytes.
        if (out.length >= buf.length) continue;
        replacements.push({ idx: c.idx, dataUrl: `data:image/webp;base64,${out.toString("base64")}` });
      } catch {
        // Best-effort: leave the original src on any fetch/decode failure.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, targets.length) }, worker));
  if (replacements.length === 0) return;

  await page.evaluate(
    (reps) =>
      Promise.all(
        reps.map(
          ({ idx, dataUrl }) =>
            new Promise<void>((resolve) => {
              const img = document.images[idx];
              if (!img) return resolve();
              img.removeAttribute("srcset");
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
              img.src = dataUrl;
            })
        )
      ).then(() => undefined),
    replacements
  );
}

/**
 * Replace <img> that failed to load (blocked host like imgur → 429, 404, timeout) with a
 * neutral placeholder, so server-side renders (PDF/PNG/thumbnails) never ship a broken-image
 * glyph. Preserves the element's box (size + class) so layout doesn't shift; once the image
 * is ingested to our own CDN it loads normally and this no-ops. Copy is intentionally neutral
 * ("Imagen no disponible") — it must not leak the technical reason to the document's reader.
 *
 * Call AFTER setContentAndWaitForAssets (images have had their load window). Returns the count.
 */
export async function replaceBrokenImages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const broken = Array.from(document.images).filter(
      (img) => !img.complete || img.naturalWidth === 0
    );
    for (const img of broken) {
      const r = img.getBoundingClientRect();
      const w = Math.round(r.width || img.width || 0);
      const h = Math.round(r.height || img.height || 0);
      const ph = document.createElement("div");
      ph.className = img.className;
      ph.setAttribute(
        "style",
        `${img.getAttribute("style") || ""};` +
          `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;` +
          `${w ? `width:${w}px;` : ""}${h ? `height:${h}px;` : ""}` +
          `background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;border-radius:8px;` +
          `font-family:system-ui,sans-serif;font-size:12px;font-weight:600;overflow:hidden;box-sizing:border-box;`
      );
      ph.innerHTML =
        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">` +
        `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>` +
        `<path d="M21 15l-5-5L5 21"/></svg>` +
        (Math.min(w, h) >= 64 ? `<span>Imagen no disponible</span>` : ``);
      img.replaceWith(ph);
    }
    return broken.length;
  });
}

/** Graceful shutdown — close the browser if running */
export async function shutdownPool() {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close().catch(() => {});
  }
}
