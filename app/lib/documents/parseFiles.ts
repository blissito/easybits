/**
 * Client-side multi-format file parser.
 * Accepts multiple files and returns combined text content.
 */

/** Max file size: 10 MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Max chars sent to AI */
export const MAX_CONTENT_CHARS = 15_000;

export interface ParsedFile {
  name: string;
  content: string;
  type: string;
  /** Set when file exceeds MAX_FILE_SIZE */
  skipped?: boolean;
  error?: string;
}

export interface ParseResult {
  files: ParsedFile[];
  /** True if combined content exceeds MAX_CONTENT_CHARS */
  truncated: boolean;
  totalChars: number;
}

export async function parseFiles(files: File[]): Promise<ParsedFile[]> {
  const results: ParsedFile[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    if (file.size > MAX_FILE_SIZE) {
      results.push({
        name: file.name,
        content: "",
        type: ext,
        skipped: true,
        error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      });
      continue;
    }

    let content = "";

    try {
      if (ext === "txt" || ext === "md") {
        content = await file.text();
      } else if (ext === "csv") {
        content = await file.text();
      } else if (ext === "xlsx" || ext === "xls") {
        content = await parseXlsx(file);
      } else if (ext === "docx") {
        content = await parseDocx(file);
      } else if (ext === "pdf") {
        content = await parsePdf(file);
      } else {
        // Fallback: try reading as text
        content = await file.text();
      }
    } catch (err) {
      console.error(`Error parsing ${file.name}:`, err);
      content = "";
      results.push({ name: file.name, content: "", type: ext, error: `Error al leer: ${(err as Error).message || "formato no soportado"}` });
      continue;
    }

    results.push({ name: file.name, content, type: ext });
  }

  return results;
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parseXlsx(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (workbook.SheetNames.length > 1) {
      lines.push(`\n=== Hoja: ${sheetName} ===`);
    }
    lines.push(csv);
  }

  return lines.join("\n");
}

async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  // Use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n--- Página " + " ---\n\n");
}

/**
 * Render PDF pages as JPEG data URLs using canvas.
 * Runs client-side only (requires DOM canvas).
 */
export async function renderPdfPages(
  file: File,
  opts?: { maxPages?: number; scale?: number }
): Promise<string[]> {
  const maxPages = opts?.maxPages ?? 20;
  const scale = opts?.scale ?? 1.5;

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const dataUrls: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await (page.render as any)({ canvasContext: ctx, viewport }).promise;
    dataUrls.push(canvas.toDataURL("image/jpeg", 0.8));
  }

  return dataUrls;
}

export function combineContent(parsed: ParsedFile[]): string {
  const valid = parsed.filter((f) => !f.skipped && !f.error);
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0].content;

  return valid
    .map((f) => `--- Contenido de ${f.name} ---\n${f.content}`)
    .join("\n\n");
}

/** Returns combined content + metadata about truncation and errors */
export function combineContentWithMeta(parsed: ParsedFile[]): ParseResult {
  const combined = combineContent(parsed);
  return {
    files: parsed,
    truncated: combined.length > MAX_CONTENT_CHARS,
    totalChars: combined.length,
  };
}
