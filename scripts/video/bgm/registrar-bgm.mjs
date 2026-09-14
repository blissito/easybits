/**
 * Registrar la pista elegida para que nunca se repita.
 *
 *   node registrar-bgm.mjs /tmp/bgm/06.mp3 videos/mi-short
 *
 * Lee el crédito del `creditos.json` que dejó fetch-bgm.mjs y lo anota en
 * `usadas.json`. A partir de ahí fetch-bgm.mjs descarta esa pista sola.
 *
 * Hacerlo SIEMPRE al elegir. "Pista nueva cada video" se venía cumpliendo de
 * memoria, y así se agotó Mixkit sin que nadie lo notara.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";

const [mp3, video] = process.argv.slice(2);
if (!mp3 || !video) {
  console.error("uso: node registrar-bgm.mjs <mp3 elegido> <proyecto del video>");
  process.exit(1);
}

const creditos = JSON.parse(readFileSync(join(dirname(mp3), "creditos.json"), "utf8"));
const c = creditos.find((x) => x.archivo === basename(mp3));
if (!c) {
  console.error(`${basename(mp3)} no aparece en creditos.json`);
  process.exit(1);
}

const ruta = join(import.meta.dirname, "usadas.json");
const usadas = JSON.parse(readFileSync(ruta, "utf8"));
if (usadas.some((u) => u.fuente === c.pagina)) {
  console.error(`⚠️  "${c.titulo}" YA se usó — elige otra.`);
  process.exit(1);
}

usadas.push({ fuente: c.pagina, titulo: c.titulo, autor: c.autor, licencia: c.licencia, video });
writeFileSync(ruta, JSON.stringify(usadas, null, 2) + "\n");

console.log(`Registrada: ${c.titulo} — ${c.autor}`);
console.log(`\nCrédito para la descripción del short:\n  Música: "${c.titulo}" de ${c.autor} — ${c.licencia.replace(" (pide crédito)", "")}`);
