/**
 * Edición quirúrgica de HTML por `data-id` — vive en `@ghostystudio/pointer/html` (MIT), la única
 * implementación compartida por EasyBits, Deník y Ghosty Studio. Este módulo se queda como subruta
 * publicada (`@easybits.cloud/html-tailwind-generator/htmlPatch`) para quien ya lo importa: mismo
 * contrato de siempre (`NodeInfo` con `dataId`/`parentDataId`).
 */
import { indexNodes as indexPointerNodes } from "@ghostystudio/pointer/html";

export {
  stampIds,
  applyPatches,
  type PatchOp,
  type InsertPos,
  type HtmlPatch,
  type PatchFailReason,
  type PatchFailure,
  type PatchResult,
} from "@ghostystudio/pointer/html";

export interface NodeInfo {
  dataId: string | null;
  tag: string;
  classes: string[];
  /** Texto propio (no el de los descendientes), colapsado. */
  text: string;
  depth: number;
  start: number;
  end: number;
  startTagEnd: number;
  /** Offset donde empieza el tag de cierre; null en elementos void. */
  endTagStart: number | null;
  parentDataId: string | null;
}

/** Indexa todos los elementos con sus offsets (contrato histórico de este paquete). */
export function indexNodes(html: string): NodeInfo[] {
  return indexPointerNodes(html).map((n) => ({
    dataId: n.id,
    tag: n.tag,
    classes: n.classes,
    text: n.text,
    depth: n.depth,
    start: n.start,
    end: n.end,
    startTagEnd: n.startTagEnd,
    endTagStart: n.endTagStart,
    parentDataId: n.parentId,
  }));
}
