/**
 * Edición quirúrgica de HTML por `data-id`.
 *
 * Un agente que solo sabe reemplazar secciones enteras reescribe 40 KB para mover
 * un texto: caro, lento, y —lo que de verdad importa— **cada reescritura completa
 * es una oportunidad de cambiar cosas que nadie pidió**. Con direcciones estables
 * el agente toca un nodo y el resto del documento ni se entera.
 *
 * ## Por qué offsets y no DOM
 *
 * Este módulo usa parse5 como ÍNDICE sobre el string original y **nunca serializa**.
 * Toda modificación es un splice, así que lo que no se edita queda **byte-idéntico**.
 *
 * Re-serializar con un DOM (jsdom, `innerHTML`) normaliza comillas, reordena
 * atributos y cierra tags implícitos: un cambio de color ensuciaría el diff del
 * documento entero y podría alterar una página que nadie pidió tocar. En documentos
 * con `<script>` (una calculadora, un juego) el round-trip además puede romperlos.
 *
 * ## Contrato
 *
 * `applyPatches` NUNCA falla en silencio: devuelve `applied[]` y `failed[]` con el
 * motivo de cada uno. Un patch que no aplica deja el documento intacto, que es
 * preferible a aplicarlo sobre el nodo equivocado.
 */
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type El = DefaultTreeAdapterMap["element"];
type ChildNode = DefaultTreeAdapterMap["childNode"];

/** Elementos sin contenido: no admiten append/prepend. */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Nunca son objetivo quirúrgico: parchearlos es rediseñar el documento. */
const ROOT_TAGS = new Set(["html", "head", "body"]);

const isElement = (n: ChildNode): n is El =>
  "tagName" in n && typeof (n as El).tagName === "string";

const attr = (el: El, name: string): string | null =>
  el.attrs.find((a) => a.name === name)?.value ?? null;

export interface NodeInfo {
  dataId: string | null;
  tag: string;
  classes: string[];
  /** Texto propio (no el de los descendientes), colapsado. */
  text: string;
  depth: number;
  /** Offsets del elemento completo dentro del HTML. */
  start: number;
  end: number;
  /** Offset del `>` que cierra el tag de apertura. */
  startTagEnd: number;
  /** Offset donde empieza el tag de cierre; null en elementos void. */
  endTagStart: number | null;
  parentDataId: string | null;
}

/**
 * Indexa todos los elementos con sus offsets. Una sola pasada.
 *
 * Se usa `parseFragment`, no `parse`: con `parse`, parse5 inventa `html/head/body`
 * sintéticos y corre todos los offsets. Los nodos sin `sourceCodeLocation` (tags
 * implícitos que el parser inventó) se saltan: sin offsets no se puede editar, y
 * adivinarlos es como se corrompe HTML ajeno.
 */
export function indexNodes(html: string): NodeInfo[] {
  const frag = parseFragment(html, { sourceCodeLocationInfo: true });
  const out: NodeInfo[] = [];

  const walk = (node: ChildNode, depth: number, parentDataId: string | null) => {
    if (!isElement(node)) return;
    const loc = node.sourceCodeLocation;
    const dataId = attr(node, "data-id");
    if (loc?.startTag) {
      out.push({
        dataId,
        tag: node.tagName,
        classes: (attr(node, "class") ?? "").split(/\s+/).filter(Boolean),
        text: ownText(node),
        depth,
        start: loc.startOffset,
        end: loc.endOffset,
        startTagEnd: loc.startTag.endOffset,
        endTagStart: loc.endTag?.startOffset ?? null,
        parentDataId,
      });
    }
    for (const child of node.childNodes ?? []) {
      walk(child, depth + 1, dataId ?? parentDataId);
    }
  };

  for (const child of frag.childNodes) walk(child, 0, null);
  return out;
}

/**
 * Texto DIRECTO del elemento, sin el de sus descendientes: con `textContent` cada
 * wrapper heredaría el texto de sus hijos y el outline repetiría cada frase tantas
 * veces como ancestros tiene.
 */
function ownText(el: El): string {
  return (el.childNodes ?? [])
    .filter((n) => n.nodeName === "#text")
    .map((n) => (n as unknown as { value: string }).value)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────── stampIds ────

/**
 * Siembra `data-id` en todo elemento que no lo tenga.
 *
 * **Deterministas por ruta** (`{prefix}0.2.1`), no aleatorios: volver a sembrar da
 * el mismo resultado, así que un outline que el agente ya tenía sigue siendo válido
 * y la operación es idempotente. Los ids existentes se respetan tal cual — sembrar
 * solo AÑADE.
 *
 * Se inserta justo antes del `>` del tag de apertura y en orden DESCENDENTE de
 * offset, para que cada inserción no invalide los offsets que faltan.
 *
 * No se hace con regex sobre los tags: se rompe en cuanto un atributo contiene un
 * `>` (un `path` de SVG, un `style` con `content: ">"`).
 */
export function stampIds(html: string, prefix = "n"): { html: string; added: number } {
  const frag = parseFragment(html, { sourceCodeLocationInfo: true });
  const inserts: { at: number; text: string; selfClosing: boolean }[] = [];

  const walk = (node: ChildNode, path: number[]) => {
    if (!isElement(node)) return;
    const loc = node.sourceCodeLocation;
    if (loc?.startTag && !attr(node, "data-id")) {
      const raw = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
      inserts.push({
        at: loc.startTag.endOffset - 1,
        text: ` data-id="${prefix}${path.join(".")}"`,
        selfClosing: /\/\s*>$/.test(raw),
      });
    }
    let i = 0;
    for (const child of node.childNodes ?? []) {
      if (isElement(child)) walk(child, [...path, i++]);
    }
  };

  let root = 0;
  for (const child of frag.childNodes) {
    if (isElement(child)) walk(child, [root++]);
  }

  let out = html;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) {
    // En `<br/>` el `>` va precedido de `/`: insertar antes de la barra, o quedaría
    // `<br/ data-id="…">` y el atributo se pierde.
    const at = ins.selfClosing ? backUpOverSlash(out, ins.at) : ins.at;
    out = out.slice(0, at) + ins.text + out.slice(at);
  }
  return { html: out, added: inserts.length };
}

function backUpOverSlash(html: string, at: number): number {
  let i = at;
  while (i > 0 && /[\s/]/.test(html[i - 1])) i--;
  return i;
}

// ────────────────────────────────────────────────────────────── applyPatches ──

export type PatchOp = "replace" | "remove" | "insert";
export type InsertPos = "append" | "prepend" | "before" | "after";

export interface HtmlPatch {
  /** `data-id` del nodo objetivo (en `insert`, el ANCLA). */
  nodeId: string;
  /** Default "replace". */
  op?: PatchOp;
  /** Solo en `insert`. Default "append". */
  pos?: InsertPos;
  /** HTML del subárbol nuevo (outerHTML completo). Vacío en `remove`. */
  html?: string;
}

export type PatchFailReason =
  /** No existe ningún nodo con ese data-id. */
  | "missing"
  /** Hay MÁS DE UNO: editar el equivocado es peor que no editar. */
  | "ambiguous"
  /** El HTML del patch no trae ningún elemento (prosa del modelo, markup a medias). */
  | "unparseable"
  /** El objetivo es html/head/body o el documento entero: eso es rediseñar, no parchear. */
  | "root"
  /** append/prepend sobre un elemento void (`<img>`, `<br>`): no admite hijos. */
  | "void"
  /** El patch venía sin contenido. */
  | "empty";

export interface PatchFailure {
  nodeId: string;
  reason: PatchFailReason;
}

export interface PatchResult {
  /** El documento resultante (= la entrada si no aplicó ninguno). */
  html: string;
  applied: string[];
  failed: PatchFailure[];
}

/** Inyecta `data-id` en el primer elemento del fragmento, si no lo trae. */
function ensureRootId(fragment: string, nodeId: string): string {
  const nodes = indexNodes(fragment);
  const first = nodes.find((n) => n.depth === 0);
  if (!first) return fragment;
  if (first.dataId !== null) {
    // El id de la CABECERA manda aunque el modelo lo haya cambiado.
    if (first.dataId === nodeId) return fragment;
    const withoutOld = fragment.replace(
      new RegExp(`\\s*data-id="${escapeRe(first.dataId)}"`),
      ""
    );
    return ensureRootId(withoutOld, nodeId);
  }
  const raw = fragment.slice(first.start, first.startTagEnd);
  const selfClosing = /\/\s*>$/.test(raw);
  const at = selfClosing
    ? backUpOverSlash(fragment, first.startTagEnd - 1)
    : first.startTagEnd - 1;
  return fragment.slice(0, at) + ` data-id="${nodeId}"` + fragment.slice(at);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quita los `data-id` de un fragmento: los nodos nuevos no tienen dirección aún. */
function stripIds(fragment: string): string {
  return fragment.replace(/\s+data-id="[^"]*"/g, "");
}

/**
 * Aplica los patches en orden, **re-indexando entre cada uno**.
 *
 * Re-indexar cuesta un parse por patch, y es lo correcto: dos patches pueden tocar
 * un nodo y su ancestro, y aplicar splices con offsets calculados sobre el
 * documento viejo escribiría en posiciones que ya se movieron. La alternativa
 * (ordenar por offset descendente) falla justo en el caso anidado, que es el que
 * más se da cuando un agente arregla varias cosas de un tirón.
 */
export function applyPatches(html: string, patches: HtmlPatch[]): PatchResult {
  const applied: string[] = [];
  const failed: PatchFailure[] = [];
  let current = html;

  for (const patch of patches) {
    const op: PatchOp = patch.op ?? "replace";
    const body = (patch.html ?? "").trim();

    if (!patch.nodeId || (op !== "remove" && !body)) {
      failed.push({ nodeId: patch.nodeId ?? "", reason: "empty" });
      continue;
    }

    const hits = indexNodes(current).filter((n) => n.dataId === patch.nodeId);
    if (hits.length === 0) {
      failed.push({ nodeId: patch.nodeId, reason: "missing" });
      continue;
    }
    if (hits.length > 1) {
      failed.push({ nodeId: patch.nodeId, reason: "ambiguous" });
      continue;
    }
    const target = hits[0];

    // Un patch al documento entero o a html/head/body no es quirúrgico.
    const isWholeDoc = target.start === 0 && target.end === current.length;
    const needsParent = op !== "insert" || patch.pos === "before" || patch.pos === "after";
    if (ROOT_TAGS.has(target.tag) || (needsParent && isWholeDoc && op !== "replace")) {
      failed.push({ nodeId: patch.nodeId, reason: "root" });
      continue;
    }

    if (op === "remove") {
      if (isWholeDoc) {
        failed.push({ nodeId: patch.nodeId, reason: "root" });
        continue;
      }
      current = current.slice(0, target.start) + current.slice(target.end);
      applied.push(patch.nodeId);
      continue;
    }

    // El bloque debe traer AL MENOS un elemento. VARIOS hermanos son válidos:
    // "añade dos tarjetas" produce dos <div>, y exigir uno solo lo mandaría a
    // `unparseable` sin razón.
    if (indexNodes(body).some((n) => n.depth === 0) === false) {
      failed.push({ nodeId: patch.nodeId, reason: "unparseable" });
      continue;
    }

    if (op === "replace") {
      const fragment = ensureRootId(body, patch.nodeId);
      current = current.slice(0, target.start) + fragment + current.slice(target.end);
      applied.push(patch.nodeId);
      continue;
    }

    // insert — el ancla conserva su id; los nodos NUEVOS no traen dirección todavía
    // (se la pone stampIds al final).
    const pos: InsertPos = patch.pos ?? "append";
    const fragment = stripIds(body);
    if ((pos === "append" || pos === "prepend") && VOID_TAGS.has(target.tag)) {
      failed.push({ nodeId: patch.nodeId, reason: "void" });
      continue;
    }
    let at: number;
    if (pos === "before") at = target.start;
    else if (pos === "after") at = target.end;
    else if (pos === "prepend") at = target.startTagEnd;
    else {
      if (target.endTagStart === null) {
        failed.push({ nodeId: patch.nodeId, reason: "void" });
        continue;
      }
      at = target.endTagStart;
    }
    current = current.slice(0, at) + fragment + current.slice(at);
    applied.push(patch.nodeId);
  }

  if (!applied.length) return { html, applied, failed };
  return { html: current, applied, failed };
}
