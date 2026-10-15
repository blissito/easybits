/**
 * Narración intercalada (portado de ghosty.studio, `app/lib/narracion.ts`): lo que el
 * agente dice ANTES de cada herramienta («Reviso el layout…», «Instalo lucide-react…»)
 * es avance, no respuesta. Se pinta como lista con palomitas encima de la respuesta final.
 * Sin esto los tramos llegaban pegados («…en /app...Revisando el layout…»).
 *
 * Dos fuentes, mismo resultado:
 * - En vivo: el cliente anota en qué largo del texto arrancó cada herramienta (`cortes`).
 * - En la copia guardada: se escribe como `- ✓ …` al inicio, así la recarga la ve igual.
 */

const MARCA = "✓";
const LINEA = /^- ✓ (.+)$/;

/** Un tramo es «narración» si es corto y de un solo párrafo; si no, es texto normal. */
export function esNarracion(tramo: string): boolean {
  const t = tramo.trim();
  return t.length > 0 && t.length <= 300 && !/\n\s*\n/.test(t) && !t.includes("```");
}

export function partirNarracion(texto: string, cortes?: number[]): { pasos: string[]; resto: string } {
  if (cortes?.length) {
    const validos = cortes.filter((c) => c > 0 && c <= texto.length);
    if (validos.length) {
      const tramos: string[] = [];
      let desde = 0;
      for (const c of validos) {
        const t = texto.slice(desde, c).trim();
        if (t) tramos.push(t);
        desde = c;
      }
      if (tramos.every(esNarracion)) {
        return { pasos: tramos.map((t) => t.replace(/\s*\n\s*/g, " ")), resto: texto.slice(desde).replace(/^\s+/, "") };
      }
    }
    return { pasos: [], resto: texto };
  }
  const lineas = texto.split("\n");
  const pasos: string[] = [];
  let i = 0;
  for (; i < lineas.length; i++) {
    const m = LINEA.exec(lineas[i]);
    if (!m) break;
    pasos.push(m[1].trim());
  }
  if (!pasos.length) return { pasos, resto: texto };
  return { pasos, resto: lineas.slice(i).join("\n").replace(/^\s+/, "") };
}

/** La copia que se guarda: narración como `- ✓ …` y luego la respuesta. */
export function narracionAMarkdown(tramos: string[], respuesta: string): string {
  const pasos = tramos.map((t) => t.trim()).filter(Boolean);
  if (!pasos.length || !pasos.every(esNarracion)) return respuesta;
  const lista = pasos.map((p) => `- ${MARCA} ${p.replace(/\s*\n\s*/g, " ")}`).join("\n");
  return respuesta.trim() ? `${lista}\n\n${respuesta.trim()}` : lista;
}
