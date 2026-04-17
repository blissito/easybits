/**
 * Download Google Fonts TTFs to a local cache on disk and return the path so
 * @react-pdf/renderer's Font.register can consume them via filesystem src.
 *
 * React PDF does not accept Buffer directly in Font.register; it wants a string
 * src (URL or filesystem path). HTTP would require an absolute URL and a
 * request round-trip at render time. Writing to /tmp once per font/weight is
 * simpler and faster — every subsequent render reuses the same file.
 *
 * Google's Fonts v1 CSS API serves TTF to most User-Agents. v2 prefers WOFF2
 * unless the UA looks "old"; we use v1 + a standard UA to sidestep that.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const FONTS_DIR = path.join(os.tmpdir(), "easybits-fonts");

// In-memory path cache. Key: `${family}|${weight}`. Value: absolute file path or null on prior failure.
const cache = new Map<string, string | null>();

// Inflight de-dupe — if two renders hit the same font at once, only one downloads.
const inflight = new Map<string, Promise<string | null>>();

function sanitize(family: string): string {
  return family.replace(/[^a-zA-Z0-9 \-_]/g, "").trim();
}

function cssUrl(family: string, weight: number): string {
  const q = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css?family=${q}:${weight}&display=swap`;
}

async function download(family: string, weight: number): Promise<string | null> {
  const clean = sanitize(family);
  if (!clean) return null;

  await fs.mkdir(FONTS_DIR, { recursive: true }).catch(() => {});
  const localPath = path.join(FONTS_DIR, `${clean.replace(/\s+/g, "_")}-${weight}.ttf`);

  // Already on disk from a prior process? Reuse.
  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    /* not cached */
  }

  try {
    const cssRes = await fetch(cssUrl(clean, weight), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EasyBits/1.0)" },
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    // The v1 API returns one or more @font-face blocks with `src: url(https://fonts.gstatic.com/...ttf)`.
    const urlMatch = css.match(/src:\s*url\(([^)]+\.ttf)\)/i);
    if (!urlMatch) return null;
    const ttfUrl = urlMatch[1].replace(/['"]/g, "");
    const ttfRes = await fetch(ttfUrl);
    if (!ttfRes.ok) return null;
    const buf = Buffer.from(await ttfRes.arrayBuffer());
    await fs.writeFile(localPath, buf);
    return localPath;
  } catch {
    return null;
  }
}

/**
 * Return a local filesystem path to the TTF for the given family/weight,
 * downloading and caching it the first time. Returns null if the download
 * failed (caller should fall back to the PDF's default font).
 */
export async function getFontPath(family: string, weight = 400): Promise<string | null> {
  const key = `${family}|${weight}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = download(family, weight).then((p) => {
    cache.set(key, p);
    inflight.delete(key);
    return p;
  });
  inflight.set(key, job);
  return job;
}
