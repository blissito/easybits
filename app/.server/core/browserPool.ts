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

/** Graceful shutdown — close the browser if running */
export async function shutdownPool() {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close().catch(() => {});
  }
}
