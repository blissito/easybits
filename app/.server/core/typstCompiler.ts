import { execFile } from "node:child_process";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const TMP_DIR = "/tmp/typst-pdfs";

/** Escape Typst special characters */
export function esc(s: string): string {
  return s.replace(/[\\#\[\]@*_`$<>]/g, (c) => `\\${c}`);
}

/** Format number with 2 decimal places */
export function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format date in Spanish locale */
export function fmtDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

/** Convert hex color to Typst rgb() format */
export function hexToTypstRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb("${h}")`;
}

export interface CompileOpts {
  /** Files to write into the temp dir before compiling (e.g. images, logos) */
  assets?: Array<{ name: string; data: Buffer }>;
}

/** Compile a Typst source string to PDF. Returns the PDF buffer. */
export async function compileTypst(typstSource: string, opts?: CompileOpts): Promise<Buffer> {
  await mkdir(TMP_DIR, { recursive: true });
  const id = randomUUID().slice(0, 8);
  const dir = join(TMP_DIR, id);
  await mkdir(dir, { recursive: true });
  const typFile = join(dir, "main.typ");
  const pdfFile = join(dir, "main.pdf");

  try {
    // Write assets
    if (opts?.assets) {
      await Promise.all(opts.assets.map((a) => writeFile(join(dir, a.name), a.data)));
    }

    await writeFile(typFile, typstSource, "utf-8");

    await new Promise<void>((resolve, reject) => {
      execFile("typst", ["compile", typFile, pdfFile], { timeout: 10_000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(`Typst compilation failed: ${stderr || err.message}`));
        else resolve();
      });
    });

    return await readFile(pdfFile);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
