/**
 * clone_pdf — clona páginas de un PDF a HTML estático con el esqueleto
 * determinista (texto, fuentes y fondo salen del PDF; ver pdfCloneSkeleton.ts).
 *
 * Cada página pesa varios MB (fuentes y fondo en base64): se sube como archivo y
 * se devuelve su URL, nunca el HTML en la respuesta (le llenaría el contexto al
 * agente). Con `verify`, la misma llamada pasa el resultado por compare_render.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuthContext } from "../apiAuth";
import { buildSkeleton } from "./pdfCloneSkeleton";
import { buildCloneDocument } from "./presentationClone";
import { compareRender, loadPdf, COMPARE_MAX_PAGES, type CompareResult } from "./renderCompare";
import { storeRender } from "./fleetRender";

export interface ClonePdfInput {
  fileId?: string;
  pdfUrl?: string;
  /** Páginas 1-based. */
  pages: number[];
  verify?: boolean;
}

export interface ClonedPage {
  page: number;
  url: string | null;
  fileId: string | null;
  pageCss: { width: number; height: number };
  words: number;
  /** Fuentes sin archivo extraíble (Type 3, CFF, no incrustadas) → equivalente. */
  substitutedFonts: string[];
  /** Pocas palabras = página escaneada: el esqueleto no aplica. */
  scanned: boolean;
  error?: string;
}

export interface ClonePdfResult {
  pages: ClonedPage[];
  verify: CompareResult | null;
}

export async function clonePdf(ctx: AuthContext, input: ClonePdfInput): Promise<ClonePdfResult> {
  if (!input.pages?.length) throw new Error("pasa al menos una página en `pages`");
  if (input.pages.length > COMPARE_MAX_PAGES) throw new Error(`máximo ${COMPARE_MAX_PAGES} páginas por llamada`);
  const pdf = await loadPdf(ctx, { fileId: input.fileId, pdfUrl: input.pdfUrl, pages: [] });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clonepdf-"));
  const pdfPath = path.join(dir, "src.pdf");
  await fs.writeFile(pdfPath, pdf);
  const pages: ClonedPage[] = [];
  const docs: { page: number; html: string }[] = [];
  try {
    for (const page of input.pages) {
      try {
        const sk = await buildSkeleton(pdfPath, page);
        const html = await buildCloneDocument(sk.html, sk.cssW, sk.cssH, sk.css);
        const stored = await storeRender(ctx, Buffer.from(html), "text/html", `clone-p${page}`, "html");
        docs.push({ page, html });
        pages.push({
          page,
          url: stored.url,
          fileId: stored.fileId,
          pageCss: { width: sk.cssW, height: sk.cssH },
          words: sk.words,
          substitutedFonts: sk.substituted,
          scanned: sk.words < 5,
        });
      } catch (e) {
        pages.push({ page, url: null, fileId: null, pageCss: { width: 0, height: 0 }, words: 0, substitutedFonts: [], scanned: false, error: (e as Error).message });
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  const verify = input.verify && docs.length
    ? await compareRender(ctx, { fileId: input.fileId, pdfUrl: input.pdfUrl, pages: docs })
    : null;
  return { pages, verify };
}
