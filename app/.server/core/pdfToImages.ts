/**
 * Convert PDF pages to base64 PNG images using poppler's `pdftoppm`.
 *
 * pdftoppm reads the PDF straight from disk and writes one PNG per page with
 * bounded memory — independent of file size. This replaces the old
 * chromium + pdf.js path, which fed the whole PDF through CDP as base64
 * (~3 in-memory copies) and OOM-killed the 1GB host on heavy PDFs, dropping
 * the open MCP connection mid-request (-32603).
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Serialize rasterization jobs so we never run N pdftoppm processes at once.
let pdfQueue: Promise<any> = Promise.resolve();

function enqueuePdfJob<T>(fn: () => Promise<T>): Promise<T> {
  const result = pdfQueue.then(fn, fn);
  pdfQueue = result.catch(() => {});
  return result;
}

// Honest backstop: pdftoppm streams from disk so 90MB docs are fine, but we
// still buffer the input in Node before writing it. Reject absurd inputs so a
// pathological file can't exhaust memory. The real work cap is `maxPages`.
const MAX_PDF_BYTES = 150 * 1024 * 1024;
const PDFTOPPM_TIMEOUT_MS = 120_000;

export interface PdfPage {
  image: string; // base64 PNG
  width: number; // rendered pixel width
  height: number; // rendered pixel height
}

/** Parse width/height from a PNG IHDR header. Returns null on failure. */
function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  // 8-byte signature + 4-byte length + "IHDR" + width(4) + height(4)
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}

/**
 * Convert PDF to images. Returns page images with their rendered dimensions.
 * @param maxPages - render at most this many leading pages (default 20).
 * @param maxWidth - render width in px (default 1200). Height preserves aspect ratio.
 */
export async function pdfToImages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; maxWidth?: number } = {}
): Promise<PdfPage[]> {
  const { maxPages = 20, maxWidth = 1200 } = opts;

  if (pdfBuffer.length > MAX_PDF_BYTES) {
    throw new Error(
      `PDF too large to rasterize (${(pdfBuffer.length / 1e6).toFixed(1)}MB, max ${MAX_PDF_BYTES / 1e6}MB)`
    );
  }

  return enqueuePdfJob(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf2img-"));
    const pdfPath = path.join(dir, "in.pdf");
    const prefix = path.join(dir, "page");
    try {
      await fs.writeFile(pdfPath, pdfBuffer);

      // -scale-to-x sets width; -scale-to-y -1 preserves aspect ratio.
      // -l caps the last page rendered so a huge PDF only costs `maxPages`.
      try {
        await execFileAsync(
          "pdftoppm",
          [
            "-png",
            "-scale-to-x", String(maxWidth),
            "-scale-to-y", "-1",
            "-l", String(maxPages),
            pdfPath,
            prefix,
          ],
          { timeout: PDFTOPPM_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
        );
      } catch (err: any) {
        const detail = (err?.stderr || err?.message || String(err)).toString().trim();
        throw new Error(`PDF rendering failed: ${detail}`);
      }

      // pdftoppm names files <prefix>-<n>.png (zero-padded for large docs).
      // Sort numerically by the trailing page number so order is correct.
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
        .sort((a, b) => {
          const na = parseInt(a.replace(/\D+/g, ""), 10);
          const nb = parseInt(b.replace(/\D+/g, ""), 10);
          return na - nb;
        });

      const results: PdfPage[] = [];
      for (const f of files) {
        const buf = await fs.readFile(path.join(dir, f));
        const dims = readPngDimensions(buf) || { width: maxWidth, height: maxWidth };
        results.push({
          image: buf.toString("base64"),
          width: dims.width,
          height: dims.height,
        });
      }
      return results;
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
