/**
 * Texto editado con doble clic en la vista previa de una WEB APP → su JSX, sin modelo.
 *
 * Sólo cuando es seguro: el `data-eb-id="X"` aparece UNA vez y los hijos del elemento son texto
 * y formato en línea (b, strong, span…), sin `{expresiones}` ni componentes. Cualquier otra cosa
 * devuelve `{ok:false}` y el editor se lo pasa al agente: adivinar en JSX rompe la app.
 */
const INLINE = new Set(["b", "strong", "i", "em", "u", "br", "span", "small", "mark", "a"]);

export type JsxTextResult = { ok: true; source: string } | { ok: false; reason: string };

/** Fin de la etiqueta de apertura que arranca en `from` (salta comillas y `{…}`); -1 si no cierra. */
function openTagEnd(s: string, from: number): number {
  let depth = 0;
  let quote = "";
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

/** Hijos «planos»: texto y etiquetas en línea sin atributos dinámicos ni expresiones. */
function plainChildren(children: string): boolean {
  if (children.includes("{")) return false;
  for (const m of children.matchAll(/<\/?\s*([A-Za-z][\w.]*)/g)) if (!INLINE.has(m[1])) return false;
  return true;
}

const escText = (t: string) => t.replace(/[{}]/g, (c) => `{"${c}"}`).replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** El HTML en línea del navegador → JSX: sólo etiquetas permitidas, `class` → `className`. */
export function inlineHtmlToJsx(html: string): string {
  let out = "";
  let last = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z]+)([^>]*)>/g)) {
    out += escText(html.slice(last, m.index).replace(/&nbsp;/g, " "));
    last = m.index! + m[0].length;
    const tag = m[2].toLowerCase();
    if (!INLINE.has(tag)) continue;
    if (m[1]) {
      if (tag !== "br") out += `</${tag}>`;
      continue;
    }
    const cls = m[3].match(/\bclass="([^"]*)"/)?.[1];
    const href = tag === "a" ? m[3].match(/\bhref="([^"]*)"/)?.[1] : undefined;
    const attrs = (cls ? ` className="${cls}"` : "") + (href && !/^\s*javascript:/i.test(href) ? ` href="${href}"` : "");
    out += tag === "br" ? "<br />" : `<${tag}${attrs}>`;
  }
  return out + escText(html.slice(last).replace(/&nbsp;/g, " "));
}

/**
 * Cambia el contenido del elemento `data-eb-id="id"` de un archivo JSX/TSX. `html` (lo que dejó el
 * navegador) manda si los hijos ya traían formato en línea; si no, `text` escapado.
 */
export function replaceJsxText(source: string, id: string, edit: { text: string; html?: string }): JsxTextResult {
  const attr = `data-eb-id="${id.replace(/["\\]/g, "")}"`;
  const at = source.indexOf(attr);
  if (at === -1) return { ok: false, reason: "no encontré ese texto en el código" };
  if (source.indexOf(attr, at + attr.length) !== -1) return { ok: false, reason: "ese id está repetido" };
  const open = source.lastIndexOf("<", at);
  const tag = source.slice(open + 1).match(/^([A-Za-z][\w.]*)/)?.[1];
  if (open === -1 || !tag) return { ok: false, reason: "no reconocí la etiqueta" };
  const end = openTagEnd(source, open);
  if (end === -1 || source[end - 1] === "/") return { ok: false, reason: "ese elemento no lleva texto" };
  const close = source.indexOf(`</${tag}>`, end);
  if (close === -1) return { ok: false, reason: "no encontré el cierre de la etiqueta" };
  const children = source.slice(end + 1, close);
  if (new RegExp(`<${tag}[\\s>]`).test(children) || !plainChildren(children)) return { ok: false, reason: "ese texto se arma con código" };
  const text = edit.text.replace(/\s+$/, "").slice(0, 4000);
  if (!text.trim()) return { ok: false, reason: "el texto quedó vacío" };
  // Se conserva la sangría alrededor del texto: el diff es sólo el texto.
  const lead = children.match(/^\s*/)![0];
  const trail = children.match(/\s*$/)![0];
  const body = /<[A-Za-z]/.test(children) && edit.html ? inlineHtmlToJsx(edit.html) : escText(text);
  return { ok: true, source: source.slice(0, end + 1) + lead + body.trim() + trail + source.slice(close) };
}
