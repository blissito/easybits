/**
 * Bajar candidatas de cama musical desde Openverse (el buscador de Creative
 * Commons). No pide API key ni registro.
 *
 * El catálogo de audio es sobre todo Jamendo — música real de artistas, no
 * library music — y se filtra por licencia para que el uso comercial sea
 * legal: `cc0` no pide nada, `by` pide crédito en la descripción del short.
 *
 *   node fetch-bgm.mjs "upbeat electronic" /tmp/bgm-candidatas
 *   node fetch-bgm.mjs "lofi hip hop" /tmp/bgm --license cc0 --n 40
 *
 * Deja los mp3 numerados en el directorio y un `creditos.json` con título,
 * autor, licencia y la página de origen de cada uno. Ese archivo es lo que
 * alimenta la tabla de BGM.md: si la elegida es `by`, el crédito sale de ahí.
 *
 * Después: node ../medir-bgm.mjs /tmp/bgm-candidatas
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const correr = promisify(execFile);

const API = "https://api.openverse.org/v1/audio/";

// Registro de pistas ya usadas. Existe porque "pista nueva cada video" se
// venía cumpliendo de memoria, y así fue como Mixkit se agotó sin que nadie se
// diera cuenta. Se compara contra la página de origen, que es la identidad
// estable de la pista (el hash del mp3 no sirve: solo bajamos un fragmento).
const RUTA_USADAS = join(import.meta.dirname, "usadas.json");
const usadas = new Set(
  JSON.parse(readFileSync(RUTA_USADAS, "utf8")).map((u) => u.fuente)
);

const [query, outDir] = process.argv.slice(2);
if (!query || !outDir) {
  console.error("uso: node fetch-bgm.mjs <búsqueda> <directorio> [--license cc0,by] [--n 30] [--velocidad rapidas|lentas|todas]");
  process.exit(1);
}

function flag(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : porDefecto;
}

const license = flag("license", "cc0,by");
const source = flag("source", "jamendo");
const objetivo = Number(flag("n", 30));
// Con --estricto se descartan las pistas cuyo género declarado no coincide con
// el término buscado. Da menos candidatas pero todas del estilo pedido.
const ESTRICTO = process.argv.includes("--estricto");
// Jamendo etiqueta la velocidad. bliss pide movida, y el grueso del catálogo es
// `speed_medium`: sin este filtro el lote se llena de pistas que va a rechazar.
// `--velocidad todas` lo apaga cuando hace falta una cama pausada (un clip de
// 60 s de voz continua se cansa con BPM alto, aunque esté baja).
const VELOCIDAD = flag("velocidad", "rapidas");

// De 1 a 6 min: más corto no cubre un short con outro, más largo suele ser un
// set y no una pieza.
const MIN_MS = 60_000;
const MAX_MS = 360_000;

// Jamendo etiqueta cada pista como `instrumental` o `vocal`. Una canción
// cantada no sirve de cama: compite con la narración palabra por palabra, y el
// medidor no la distingue (mide energía, no voz). Se filtra aquí o no se
// filtra nunca.
function sirve(r, termino) {
  if (usadas.has(r.foreign_landing_url)) return false;
  const tags = (r.tags ?? []).map((t) => t.name.toLowerCase());
  if (tags.includes("vocal")) return false;
  if (!tags.includes("instrumental")) return false;
  if (VELOCIDAD === "rapidas" && !tags.includes("speed_high") && !tags.includes("speed_veryhigh")) return false;
  if (VELOCIDAD === "lentas" && !tags.includes("speed_low") && !tags.includes("speed_verylow")) return false;
  const dur = r.duration ?? 0;
  if (dur < MIN_MS || dur > MAX_MS) return false;
  // Openverse busca sobre el texto: "house" trae "Burnin Down the House". Si
  // el término es un género de verdad, se exige que la pista lo declare.
  const generos = (r.genres ?? []).map((g) => g.toLowerCase());
  if (generos.length && !generos.some((g) => g.includes(termino) || termino.includes(g))) {
    return !ESTRICTO;
  }
  return true;
}

// Openverse hace AND estricto sobre los metadatos: "upbeat electronic" casi
// siempre da cero. Cada palabra se busca por separado y los resultados se
// juntan — de paso el lote sale más variado.
async function buscarTermino(termino, vistos, pistas, tope) {
  for (let page = 1; page <= 12 && pistas.length < tope; page++) {
    const url = `${API}?q=${encodeURIComponent(termino)}&license=${license}&source=${source}&page_size=20&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "fixtergeek-bgm/1.0" } });
    // 400 = se acabaron las páginas que da el acceso anónimo (tope de ~240).
    if (res.status === 400) break;
    if (!res.ok) throw new Error(`Openverse ${res.status} en "${termino}"`);
    const { results = [] } = await res.json();
    if (!results.length) break;
    for (const r of results) {
      if (!sirve(r, termino.toLowerCase())) continue;
      if (vistos.has(r.url)) continue;
      vistos.add(r.url);
      pistas.push(r);
      if (pistas.length >= tope) break;
    }
  }
}

// Los títulos vienen con entidades HTML del scrape de Jamendo (`&#039;`).
function limpiar(t) {
  return t
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

// El mismo tema aparece subido dos veces, y un solo artista prolífico se come
// medio lote. Ni una cosa ni la otra dan de dónde elegir.
const POR_ARTISTA = 2;

function depurar(pistas) {
  const titulos = new Set();
  const porArtista = new Map();
  const salida = [];
  for (const p of pistas) {
    p.title = limpiar(p.title);
    const clave = `${p.title.toLowerCase().replace(/\(.*?\)/g, "").trim()}|${p.creator}`;
    if (titulos.has(clave)) continue;
    const n = porArtista.get(p.creator) ?? 0;
    if (n >= POR_ARTISTA) continue;
    titulos.add(clave);
    porArtista.set(p.creator, n + 1);
    salida.push(p);
  }
  return salida;
}

async function buscar() {
  const vistos = new Set();
  const pistas = [];
  // Se pide de más porque depurar() recorta duplicados y artistas repetidos.
  const antes = objetivo;
  for (const termino of query.split(/\s+/).filter(Boolean)) {
    if (pistas.length >= antes * 2) break;
    await buscarTermino(termino, vistos, pistas, antes * 2);
  }
  return depurar(pistas).slice(0, antes);
}

const pistas = await buscar();
mkdirSync(outDir, { recursive: true });

const creditos = [];
const rutaCreditos = join(outDir, "creditos.json");
// Se guarda después de CADA descarga, no al final: si el proceso se corta a la
// mitad, un mp3 sin su crédito es basura — la licencia CC BY obliga a nombrar
// al artista y no hay forma de recuperarlo desde el archivo.
const guardar = () => writeFileSync(rutaCreditos, JSON.stringify(creditos, null, 2) + "\n");

// Solo se bajan los primeros ~2.5 MB (≈2.5 min a 128 kbps): alcanza de sobra
// para medir. La ganadora se baja completa con --full.
const completo = process.argv.includes("--full");
const rango = completo ? [] : ["-r", "0-2500000"];

async function bajar(p, i) {
  const id = String(i + 1).padStart(2, "0");
  const destino = join(outDir, `${id}.mp3`);
  try {
    // curl y no fetch: Jamendo responde con redirecciones al storage.
    await correr("curl", ["-sL", "--max-time", "45", ...rango, "-o", destino, p.url]);
    creditos.push({
      archivo: `${id}.mp3`,
      titulo: p.title,
      autor: p.creator,
      licencia: p.license === "cc0" ? "CC0 (sin atribución)" : `CC ${p.license.toUpperCase()} ${p.license_version} (pide crédito)`,
      licenciaUrl: p.license_url,
      pagina: p.foreign_landing_url,
      duracionSeg: Math.round((p.duration ?? 0) / 1000),
    });
    guardar();
    console.log(`${id}  ${p.license.padEnd(4)}  ${p.title} — ${p.creator}`);
  } catch (e) {
    console.error(`${id}  falló: ${String(e.message).slice(0, 80)}`);
  }
}

// De seis en seis: en serie, 30 pistas tardan más de dos minutos.
const TANDA = 6;
for (let i = 0; i < pistas.length; i += TANDA) {
  await Promise.all(pistas.slice(i, i + TANDA).map((p, j) => bajar(p, i + j)));
}

guardar();
console.log(`\n${creditos.length} candidatas en ${outDir}. Ahora: node ${join(import.meta.dirname, "medir-bgm.mjs")} ${outDir}`);
