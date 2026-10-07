/**
 * Definición compartida de `clone_pdf`: la registran el MCP principal (server.ts)
 * y el MCP `render` que la flota inyecta siempre (agentes de Ghosty Studio).
 */
import { z } from "zod";
import { COMPARE_MAX_PAGES } from "../core/renderCompare";
import type { ClonePdfResult } from "../core/pdfClone";

export const CLONE_PDF_DESC =
  "CLONA páginas de un PDF a HTML estático y editable, sin adivinar: el texto, sus posiciones, las fuentes y el fondo salen del PDF. Úsalo SIEMPRE antes de escribir un clon a mano: un clon a ojo no atina posiciones ni tipografía.\n\n" +
  "How to use:\n" +
  "- El PDF: `fileId` (tu librería) o `pdfUrl` (https público).\n" +
  `- \`pages\`: hasta ${COMPARE_MAX_PAGES} páginas (1-based).\n` +
  "- Devuelve por página `url` (el HTML, autocontenido, al tamaño `pageCss`), no el HTML: pesa varios MB por las fuentes y el fondo. Bájalo con curl si lo vas a editar.\n" +
  "- `verify: true` lo pasa además por compare_render en la misma llamada (`verify.pages[].reasons`).\n" +
  "- Cada palabra es un <span class=\"w\"> en posición absoluta: para editar texto cambia el contenido del span, no su posición. El fondo es una imagen de la página SIN texto.\n" +
  "- `substitutedFonts`: fuentes que el PDF no trae como archivo (Type 3, CFF, no incrustadas); se usó una equivalente y la tipografía puede no pasar.\n" +
  "- `scanned: true` = página sin capa de texto: aquí no aplica, clónala tú y verifica con compare_render.\n" +
  "- Cost: 1 crédito por página (2 con verify).";

export const clonePdfShape = {
  fileId: z.string().optional().describe("PDF en tu librería EasyBits. Gana sobre pdfUrl."),
  pdfUrl: z.string().url().optional().describe("PDF por URL pública https."),
  pages: z.array(z.number().int().min(1)).min(1).max(COMPARE_MAX_PAGES).describe("Páginas a clonar, 1-based."),
  verify: z.boolean().optional().describe("Verificar el resultado con compare_render en la misma llamada."),
};

export function clonePdfHint(r: ClonePdfResult): string {
  const failed = r.pages.filter((p) => p.error);
  const scanned = r.pages.filter((p) => p.scanned);
  const parts = [`${r.pages.length - failed.length}/${r.pages.length} página(s) clonadas.`];
  if (r.verify) parts.push(`Verificación: ${r.verify.passed}/${r.verify.total} pasan.`);
  if (scanned.length) parts.push(`Escaneadas (clónalas tú): ${scanned.map((p) => p.page).join(", ")}.`);
  if (failed.length) parts.push(`Fallaron: ${failed.map((p) => `${p.page} (${p.error})`).join("; ")}.`);
  return parts.join(" ");
}
