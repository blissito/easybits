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

/** Graceful shutdown — close the browser if running */
export async function shutdownPool() {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close().catch(() => {});
  }
}
