/**
 * `onlyMainContent`: limpia el markdown que devuelve el proveedor (la página
 * completa) para dejar el cuerpo: fuera imágenes decorativas, "skip to content",
 * y los bloques de nav/footer, que se reconocen porque son casi puros links.
 * Heurística, no DOM: pensada para RAG y para que un agente lea sin ruido.
 */
// El paréntesis de cierre es opcional: la última línea de la página suele llegar cortada.
const LINK_ONLY = /^\s*(?:\[[^\]]*\]\([^)]*\)?\s*|[-*]\s*|\|)*\s*$/;
const IMG = /!\[[^\]]*\]\([^)]*\)/g;
const SKIP = /^\s*\[skip to (?:main )?content\]\([^)]*\)\s*$/i;

function isNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (SKIP.test(t)) return true;
  // Un link cortado a media línea ("[Complian") sigue siendo un link, no prosa.
  if (t.startsWith("[") && !/[.!?]\s/.test(t)) return true;
  return LINK_ONLY.test(t.replace(IMG, ""));
}

/** Recorta del inicio/final los bloques donde ≥70% de las líneas son links sueltos. */
function trimNavBlocks(lines: string[]): string[] {
  const noise = lines.map(isNoise);
  const nonEmpty = (i: number) => lines[i].trim() !== "";
  const firstHeading = lines.findIndex((l) => /^#{1,3}\s/.test(l));
  // cabecera: hasta el primer heading (o 40 líneas) si es mayormente ruido
  let start = 0;
  const headEnd = firstHeading > 0 ? firstHeading : Math.min(120, lines.length);
  const headLines = [...Array(headEnd).keys()].filter(nonEmpty);
  if (headLines.length && headLines.filter((i) => noise[i]).length / headLines.length >= 0.7) start = headEnd;
  // pie: desde el final hacia atrás, mientras sean links sueltos o líneas cortas
  // sin oración ("© 2026 Runpod Inc.", "Product"), que es como se ve un footer.
  const footerish = (i: number) => noise[i] || (lines[i].trim().length <= 60 && !/^#{1,6}\s/.test(lines[i]));
  let end = lines.length;
  let i = lines.length - 1;
  let seen = 0;
  while (i >= start && footerish(i)) { if (noise[i] && nonEmpty(i)) seen++; i--; }
  if (seen >= 5) end = i + 1;
  return lines.slice(start, end);
}

/**
 * El proveedor emite links de nav en varias líneas ("[\n\nPods\n\ndesc\n\n](/x)")
 * y pega varios seguidos. Se normalizan a "[Pods desc](/x)" uno por línea para
 * que la heurística de "línea = link suelto" los vea.
 */
function normalizeLinks(md: string): string {
  return md
    .replace(/\[\s*\n[\s\S]*?\]\(/g, (m) => "[" + m.slice(1, -2).replace(/\s+/g, " ").trim() + "](")
    .replace(/\)\s*\[/g, ")\n[");
}

export function extractMainContent(markdown: string): string {
  let md = markdown.replace(IMG, (m) => (/\.(svg|gif)|icon|logo|badge/i.test(m) ? "" : m));
  md = normalizeLinks(md);
  let lines = md.split("\n").filter((l) => !SKIP.test(l));
  lines = trimNavBlocks(lines);
  return lines
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
