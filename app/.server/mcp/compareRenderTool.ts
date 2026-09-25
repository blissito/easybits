/**
 * Definición compartida de `compare_render`: la registran el MCP principal
 * (server.ts) y el MCP `render` que la flota inyecta siempre (agentes de Ghosty
 * Studio). Una sola descripción y un solo esquema para que no se desfasen.
 */
import { z } from "zod";
import { COMPARE_MAX_PAGES, DEFAULT_THRESHOLDS, type CompareResult } from "../core/renderCompare";

export const COMPARE_RENDER_DESC =
  "MIDE qué tan igual quedó un clon HTML de un PDF, página por página, en vez de juzgarlo a ojo. Es el verificador para iterar: clona → compara → arregla la peor región → compara otra vez, hasta que todas pasen.\n\n" +
  "How to use:\n" +
  "- El PDF original: `fileId` (tu librería) o `pdfUrl` (https público, así llegan los adjuntos del chat).\n" +
  `- \`pages\`: hasta ${COMPARE_MAX_PAGES} de { page (1-based), html (HTML completo y auto-contenido de ESA página) }. El HTML se renderiza al tamaño exacto de la página del PDF (1200 px de ancho): diseña el clon a ese tamaño.\n` +
  "- Por página devuelve:\n" +
  "  · `layout` (0–1): diferencia de composición ignorando el antialias de las letras. ES EL QUE DECIDE.\n" +
  "  · `pixel` (0–1): diferencia a resolución completa, incluye ruido de fuentes. Informativo.\n" +
  "  · `textCoverage` (0–1): cuánto texto del PDF quedó como TEXTO en el HTML. Pegar el PDF como imagen da layout≈0 pero coverage≈0 y NO pasa. null = PDF escaneado.\n" +
  "  · `trusted`: el HTML se renderizó igual dos veces. Si es false, el número no sirve: quita animaciones o fuentes que cargan tarde (o sube `waitMs`).\n" +
  "  · `regions`: dónde está la diferencia (x,y,w,h en px de la página, `ratio`). Arregla la primera.\n" +
  "  · `diffUrl`: imagen original | clon | diff en rojo. Mírala cuando no entiendas la región.\n" +
  `- Pasa si trusted && layout ≤ ${DEFAULT_THRESHOLDS.layout} && textCoverage ≥ ${DEFAULT_THRESHOLDS.textCoverage}. Ajustable con \`thresholds\`.\n` +
  "- Diferencias que quedan sólo por la fuente (otra versión de la misma tipografía) no vale la pena perseguirlas.\n" +
  "- Cost: 1 crédito por página.";

export const compareRenderShape = {
  fileId: z.string().optional().describe("PDF original en tu librería EasyBits. Gana sobre pdfUrl."),
  pdfUrl: z.string().url().optional().describe("PDF original por URL pública https."),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).describe("Página del PDF, 1-based."),
        html: z.string().min(1).max(2_000_000).describe("HTML completo del clon de esa página."),
      })
    )
    .min(1)
    .max(COMPARE_MAX_PAGES),
  thresholds: z
    .object({
      layout: z.number().min(0).max(1).optional(),
      textCoverage: z.number().min(0).max(1).optional(),
    })
    .optional()
    .describe(`Default layout ${DEFAULT_THRESHOLDS.layout} · textCoverage ${DEFAULT_THRESHOLDS.textCoverage}.`),
  waitMs: z.number().int().min(0).max(30000).optional().describe("Esperar N ms antes de capturar el clon."),
};

/** Una línea que le dice al agente qué hacer después. */
export function compareRenderHint(r: CompareResult): string {
  if (r.passed === r.total) return `Las ${r.total} página(s) pasan. Listo.`;
  const failing = r.pages.filter((p) => !p.pass);
  const worst = failing
    .filter((p) => p.layout != null)
    .sort((a, b) => (b.layout ?? 0) - (a.layout ?? 0))[0];
  const parts = [`${r.passed}/${r.total} pasan.`];
  const errors = failing.filter((p) => p.error).length;
  if (errors) parts.push(`${errors} con error (lee \`error\`).`);
  const untrusted = failing.filter((p) => !p.error && !p.trusted).length;
  if (untrusted) parts.push(`${untrusted} con render no determinista: quita animaciones o sube waitMs antes de fiarte del número.`);
  const lowText = failing.filter((p) => p.textCoverage != null && p.textCoverage < r.thresholds.textCoverage).length;
  if (lowText) parts.push(`${lowText} con poco texto editable: el texto debe ir como texto, no dentro de una imagen.`);
  if (worst?.regions[0]) {
    const g = worst.regions[0];
    parts.push(`Empieza por la página ${worst.page} (layout ${worst.layout}), región x${g.x} y${g.y} ${g.w}×${g.h}.`);
  }
  return parts.join(" ");
}
