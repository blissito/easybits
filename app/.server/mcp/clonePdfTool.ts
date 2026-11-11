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
  "- PRIVACIDAD: el HTML lleva el contenido del documento, así que se guarda como archivo PRIVADO en tu librería. `url` es una liga firmada que caduca en 24 h (`urlExpiresAt`); con `get_file(fileId)` sacas otra. Para borrarlo de verdad: `delete_file({ fileId, permanent: true })`. Nunca se publica.\n" +
  "- `verify: true` lo pasa además por compare_render en la misma llamada (`verify.pages[].reasons`).\n" +
  "- Cada palabra es un <span class=\"w\"> en posición absoluta: para editar texto cambia el contenido del span, no su posición. El fondo es una imagen de la página SIN texto.\n" +
  "- FUENTES: `fonts` dice con qué se pinta cada fuente del PDF: `embedded` (su propio archivo, glifos idénticos), `web` (la misma familia desde Google Fonts) o `fallback` (no existe ahí: se usó otra familia). `substitutedFonts` lista con su motivo todo lo que NO quedó incrustado (Type 3, CFF, sin archivo, o le faltan glifos): ahí la tipografía puede no pasar. Vacío = todas son las fuentes reales del PDF.\n" +
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
  const notEmbedded = [...new Set(r.pages.flatMap((p) => p.substitutedFonts ?? []))];
  if (notEmbedded.length) parts.push(`Fuentes NO incrustadas (revisa la tipografía): ${notEmbedded.join("; ")}.`);
  if (r.pages.some((p) => p.url)) parts.push("Los HTML son archivos privados: cada `url` es una liga firmada que caduca en 24 h (liga nueva: get_file; borrar ya: delete_file con permanent: true).");
  if (scanned.length) parts.push(`Escaneadas (clónalas tú): ${scanned.map((p) => p.page).join(", ")}.`);
  if (failed.length) parts.push(`Fallaron: ${failed.map((p) => `${p.page} (${p.error})`).join("; ")}.`);
  return parts.join(" ");
}
