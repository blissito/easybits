// Dónde nombra un prompt a una base de datos, y cómo renombrarla ahí. Puro, sin red: lo usa
// `db rename` y su test. Mismo criterio que `ghosty dbs rename` (Ghosty Studio 0.24).
// Sin imports a propósito: el test lo carga directo con --experimental-transform-types.
//
// Los nombres de base suelen ser también la marca («totequim»): se exige que el nombre no esté
// pegado a otra letra, dígito, `_`, `-`, `.`, `@` ni `/`, para no tocar `totequim.com`,
// `@totequim` ni `totequim_prueba`. Distingue mayúsculas: «TOTEQUIM» en el texto es la marca.

const EDGE = "A-Za-z0-9_.@/-";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRe = (name: string) => new RegExp(`(?<![${EDGE}])${escape(name)}(?![${EDGE}])`, "g");

export type NameRef = { line: number; text: string };

/** Cada renglón donde aparece `name` como palabra suelta (renglón desde 1, recortado). */
export function findNameRefs(text: string, name: string): NameRef[] {
  const re = nameRe(name);
  return text.split("\n").flatMap((l, i) => {
    re.lastIndex = 0;
    return re.test(l) ? [{ line: i + 1, text: l.trim().slice(0, 160) }] : [];
  });
}

/** El texto con `from` cambiado por `to` donde aparece como palabra suelta. */
export function replaceName(text: string, from: string, to: string): string {
  return text.replace(nameRe(from), to);
}
