/**
 * Client-side multi-format file parser.
 * Accepts multiple files and returns combined text content.
 */

export interface ParsedFile {
  name: string;
  content: string;
  type: string;
}

export async function parseFiles(files: File[]): Promise<ParsedFile[]> {
  const results: ParsedFile[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
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
      content = `[Error al leer ${file.name}]`;
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

export function combineContent(parsed: ParsedFile[]): string {
  if (parsed.length === 1) return parsed[0].content;

  return parsed
    .map((f) => `--- Contenido de ${f.name} ---\n${f.content}`)
    .join("\n\n");
}
