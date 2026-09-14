#!/usr/bin/env node
/**
 * Baja efectos de sonido de Openverse (fuente Freesound) para las transiciones
 * de los shorts. Es el gemelo de scripts/bgm/fetch-bgm.mjs, con dos diferencias:
 *
 *   - Se pide CC0 por default. Un whoosh dura medio segundo y no vale la pena
 *     cargar con la atribución de CC BY en cada video.
 *   - Se filtra por duración, no por género: lo que sirve para tapar un corte
 *     mide entre 0.2 s y 2 s. Todo lo demás es ambiente, no transición.
 *
 * uso:
 *   node scripts/sfx/fetch-sfx.mjs "whoosh swoosh sword" /tmp/sfx --n 24
 *   node scripts/sfx/fetch-sfx.mjs "impact" /tmp/sfx --max-ms 3000
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.openverse.org/v1/audio/";
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const [query, outDir] = positional;

if (!query || !outDir) {
  console.error('uso: node fetch-sfx.mjs "<búsqueda>" <directorio> [--n 24] [--min-ms 200] [--max-ms 2000] [--license cc0]');
  process.exit(1);
}

const wanted = Number(flag("n", 24));
const minMs = Number(flag("min-ms", 200));
const maxMs = Number(flag("max-ms", 2000));
const license = flag("license", "cc0");

// Openverse hace AND estricto sobre ?q=, así que cada palabra se busca por
// separado y luego se juntan los resultados sin repetir.
const terms = query.split(/\s+/).filter(Boolean);
const seen = new Set();
const picks = [];

for (const term of terms) {
  for (let page = 1; page <= 3 && picks.length < wanted * 3; page++) {
    const url = `${API}?q=${encodeURIComponent(term)}&license=${license}&source=freesound&page_size=20&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    for (const r of data.results ?? []) {
      if (seen.has(r.id)) continue;
      const ms = r.duration ?? 0;
      if (ms < minMs || ms > maxMs) continue;
      seen.add(r.id);
      picks.push(r);
    }
    if (!data.results?.length) break;
  }
}

picks.sort((a, b) => a.duration - b.duration);
const chosen = picks.slice(0, wanted);

await mkdir(outDir, { recursive: true });
const credits = [];

for (const [i, r] of chosen.entries()) {
  const id = String(i + 1).padStart(2, "0");
  const src = r.url;
  if (!src) continue;
  const res = await fetch(src);
  if (!res.ok) continue;
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(outDir, `${id}.mp3`), buf);

  credits.push({
    id,
    titulo: r.title,
    autor: r.creator,
    licencia: r.license === "cc0" ? "CC0 (sin atribución)" : `CC ${r.license.toUpperCase()} ${r.license_version} (pide crédito)`,
    duracionMs: r.duration,
    origen: r.foreign_landing_url,
  });
  // Se guarda tras cada descarga: un archivo sin su crédito es inservible.
  await writeFile(join(outDir, "creditos.json"), JSON.stringify(credits, null, 2));
  console.log(`${id}  ${String(r.duration).padStart(5)}ms  ${r.title} — ${r.creator}`);
}

console.log(`\n${credits.length} efectos en ${outDir}`);
