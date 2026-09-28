// «Did you mean…?» con distancia de Levenshtein ≤ 2, patrón de Cobra
// (SuggestionsMinimumDistance = 2). Sólo se sugiere: nunca se corre la adivinanza.
// Sin imports a propósito: el test lo carga directo con --experimental-strip-types.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Candidatos a ≤ `max` de distancia (o que empiezan con lo tecleado), del más cercano al más lejano. */
export function suggest(input: string, candidates: string[], max = 2): string[] {
  const needle = input.toLowerCase();
  const scored = [...new Set(candidates)]
    .map((c) => ({ c, d: levenshtein(needle, c.toLowerCase()) }))
    // Como Cobra: también un prefijo cuenta (`easybits sand` → sandboxes).
    .filter(({ c, d }) => d <= max || (needle.length >= 2 && c.toLowerCase().startsWith(needle)))
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c));
  return scored.map(({ c }) => c);
}

/** Pista lista para imprimir, o undefined si no hay nada cercano. */
export function didYouMean(
  input: string,
  candidates: string[],
  prefix: string,
  canonical: (name: string) => string = (n) => n,
): string | undefined {
  // Un alias cercano sugiere el nombre canónico, una sola vez (ls y list → ls).
  const hits = [...new Set(suggest(input, candidates).map(canonical))].slice(0, 3);
  if (!hits.length) return undefined;
  return `Did you mean this?\n${hits.map((h) => `  ${prefix}${h}`).join("\n")}`;
}
