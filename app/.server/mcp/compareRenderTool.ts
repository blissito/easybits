/**
 * Definición compartida de `compare_render`: la registran el MCP principal
 * (server.ts) y el MCP `render` que la flota inyecta siempre (agentes de Ghosty
 * Studio). Una sola descripción y un solo esquema para que no se desfasen.
 */
import { z } from "zod";
import { COMPARE_MAX_PAGES, DEFAULT_THRESHOLDS as T, type CompareResult } from "../core/renderCompare";

export const COMPARE_RENDER_DESC =
  "MIDE si un clon HTML de un PDF quedó igual, página por página, en vez de juzgarlo a ojo. Es el verificador para iterar: clona → compara → arregla lo que dicen `reasons` → compara otra vez, hasta que todas pasen.\n\n" +
  "How to use:\n" +
  "- El PDF original: `fileId` (tu librería) o `pdfUrl` (https público, así llegan los adjuntos del chat).\n" +
  `- \`pages\`: hasta ${COMPARE_MAX_PAGES} de { page (1-based), html (HTML completo y auto-contenido de ESA página) }.\n` +
  "- TAMAÑO: diseña cada página al tamaño CSS de la página del PDF = puntos × 4/3 (carta = 816×1056 px). La respuesta lo trae en `pageCss`. Lo que se salga de ahí cuenta como desborde.\n" +
  "- Se mide lo que el navegador PINTA, no tu código:\n" +
  `  · \`text\`: cada palabra del PDF debe existir como texto del DOM, en su lugar (≤ ${T.tolerancePt} pt). No puede faltar ninguna. \`misplaced\` dice cuáles y cuánto se corrieron (dx/dy en pt).\n` +
  "  · `text.typography`: misma familia, tamaño, peso, cursiva, color y ANCHO de palabra (el espaciado de letras del PDF cuenta: usa letter-spacing). `originalFonts` dice qué fuentes usar.\n" +
  "  · `liveText`: el texto no puede estar dentro de una imagen o canvas, ni escondido sobre una imagen del PDF.\n" +
  "  · `overflow`, `trusted` (se pinta igual dos veces), `layout` (fondos, tablas, formas; `regions` dice dónde).\n" +
  "  · `diffUrl`: original | clon | diferencias en rojo. Mírala cuando `reasons` no baste.\n" +
  "  · Cada palabra debe VERSE (no tapada) y dibujarse con los glifos del original; no puede haber letras o números de más (`invented`).\n" +
  "  · `screen`: se ve igual en pantalla que impreso.\n" +
  "- El clon se evalúa SIN JavaScript y debe ser estático: nada de <script>, @media, backdrop-filter, mix-blend-mode, hojas externas (Google/Bunny Fonts sí) ni texto con CSS content. `violations` lo lista.\n" +
  "- Cero tolerancia: una sola palabra faltante, corrida, recoloreada, tapada o inventada reprueba la página; `reasons` dice cuál y dónde.\n" +
  "- Los umbrales son fijos (no se configuran). `reasons` explica cada fallo en español.\n" +
  "- Web fonts: cárgalas con display=block y en <head>; el verificador espera a que carguen.\n" +
  "- Cost: 1 crédito por página.";

export const compareRenderShape = {
  fileId: z.string().optional().describe("PDF original en tu librería EasyBits. Gana sobre pdfUrl."),
  pdfUrl: z.string().url().optional().describe("PDF original por URL pública https."),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).describe("Página del PDF, 1-based."),
        html: z.string().min(1).max(4_000_000).describe("HTML completo del clon de esa página, al tamaño `pageCss`."),
      })
    )
    .min(1)
    .max(COMPARE_MAX_PAGES),
  waitMs: z.number().int().min(0).max(30000).optional().describe("Esperar N ms antes de capturar el clon."),
};

/** Una línea que le dice al agente qué hacer después. */
export function compareRenderHint(r: CompareResult): string {
  if (r.passed === r.total) return `Las ${r.total} página(s) pasan. Listo.`;
  const failing = r.pages.filter((p) => !p.pass);
  const first = failing[0];
  return (
    `${r.passed}/${r.total} pasan. Empieza por la página ${first.page}: ` +
    (first.reasons[0] ?? "revisa diffUrl.") +
    (failing.length > 1 ? ` (${failing.length - 1} página(s) más con fallos; cada una trae sus reasons).` : "")
  );
}
