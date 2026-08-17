/**
 * Edición por NODO — capa fina sobre las funciones puras del paquete.
 *
 * El núcleo (`stampIds`/`applyPatches`/`indexNodes`) vive en
 * `@easybits.cloud/html-tailwind-generator/htmlPatch` y es HTML→HTML, sin saber
 * nada de documentos EasyBits: así lo consumen igual quien guarda sus páginas en
 * nuestra DB y quien las guarda en la suya (denik.me las tiene en `Org.landingSections`).
 * Atar la primitiva a un `documentId` habría dejado fuera al segundo caso.
 *
 * Aquí solo se resuelve el "dónde": leer la página, aplicar, guardar.
 */
import {
  applyPatches,
  stampIds,
  indexNodes,
  type HtmlPatch,
  type PatchResult,
} from "@easybits.cloud/html-tailwind-generator/htmlPatch";
import type { AuthContext } from "../apiAuth";
import { getPageHtml, setPageHtml } from "./documentOperations";

export type { HtmlPatch, PatchResult };

export interface NodeOutlineEntry {
  dataId: string;
  tag: string;
  depth: number;
  /** Clases visualmente relevantes, recortadas — el outline es un mapa, no un dump. */
  classes: string[];
  /** Texto propio, recortado a 80 chars. */
  text: string;
  parentDataId: string | null;
}

/**
 * Árbol direccionable de una página: lo que el agente lee ANTES de parchear.
 * Sin esto tendría que pedir el HTML completo solo para averiguar los ids.
 */
export function outlineHtml(html: string, maxNodes = 250): NodeOutlineEntry[] {
  return indexNodes(html)
    .filter((n) => n.dataId)
    .slice(0, maxNodes)
    .map((n) => ({
      dataId: n.dataId!,
      tag: n.tag,
      depth: n.depth,
      classes: n.classes.slice(0, 8),
      text: n.text.slice(0, 80),
      parentDataId: n.parentDataId,
    }));
}

/**
 * Aplica patches sobre una página de documento y guarda.
 *
 * Re-estampa al final: los nodos que trae un `insert` no tienen dirección todavía,
 * y sin re-estampar el agente no podría parchear en el siguiente turno lo que acaba
 * de crear.
 */
export async function patchDocumentPage(
  ctx: AuthContext,
  documentId: string,
  pageId: string,
  patches: HtmlPatch[]
): Promise<PatchResult & { pageId: string; saved: boolean }> {
  const page = await getPageHtml(ctx, documentId, pageId);
  const current = (page as { html?: string }).html ?? "";

  // Idempotente: si la página ya venía estampada no cambia nada.
  const seeded = stampIds(current, `${pageId}-`);
  const result = applyPatches(seeded.html, patches);

  if (!result.applied.length) {
    return { ...result, html: current, pageId, saved: false };
  }
  const final = stampIds(result.html, `${pageId}-`).html;
  await setPageHtml(ctx, documentId, pageId, final);
  return { ...result, html: final, pageId, saved: true };
}

/** Lee el outline direccionable de una página, sembrando ids si hacen falta. */
export async function outlineDocumentPage(
  ctx: AuthContext,
  documentId: string,
  pageId: string
): Promise<{ nodes: NodeOutlineEntry[]; pageId: string; seeded: boolean }> {
  const page = await getPageHtml(ctx, documentId, pageId);
  const current = (page as { html?: string }).html ?? "";
  const seeded = stampIds(current, `${pageId}-`);
  if (seeded.added > 0) {
    // Persistimos las direcciones: si no, el agente parcharía contra ids que la
    // página guardada no tiene y todo saldría `missing`.
    await setPageHtml(ctx, documentId, pageId, seeded.html);
  }
  return { nodes: outlineHtml(seeded.html), pageId, seeded: seeded.added > 0 };
}
