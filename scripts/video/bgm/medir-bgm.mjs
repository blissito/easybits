/**
 * Elegir la cama musical midiendo, no de oído.
 *
 * De cada candidata saca BPM (autocorrelación sobre el flujo de onsets), RMS y
 * "punch" (qué tan marcado es el golpe). Se busca movida —BPM alto y punch
 * alto— con RMS moderado para que quepa debajo de la voz.
 *
 *   node medir-bgm.mjs /tmp/mxk
 *
 * Si el directorio trae un `creditos.json` (lo escribe fetch-bgm.mjs), la
 * tabla sale con título, autor y licencia en vez de solo el número.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SR = 8000;
const HOP = 256;
const dir = process.argv[2];

function pcm(archivo) {
  // 60s desde el segundo 8: la entrada suele ser atípica.
  const buf = execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", "8", "-t", "60", "-i", archivo, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"],
    { maxBuffer: 1 << 28 }
  );
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

function medir(x) {
  const n = Math.floor(x.length / HOP);
  const energia = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < HOP; j++) s += x[i * HOP + j] ** 2;
    energia[i] = Math.sqrt(s / HOP);
  }
  const rms = energia.reduce((a, b) => a + b, 0) / n;

  // Flujo de onsets: solo lo que sube. Los golpes son subidas de energía.
  const flujo = new Float64Array(n);
  for (let i = 1; i < n; i++) flujo[i] = Math.max(0, energia[i] - energia[i - 1]);
  const mediaFlujo = flujo.reduce((a, b) => a + b, 0) / n;
  const picoFlujo = Math.max(...flujo);
  const punch = mediaFlujo > 0 ? picoFlujo / mediaFlujo : 0;

  // Autocorrelación del flujo, en el rango 60–180 BPM.
  const fps = SR / HOP;
  let mejor = 0;
  let mejorLag = 0;
  for (let lag = Math.round((fps * 60) / 180); lag <= Math.round((fps * 60) / 60); lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += flujo[i] * flujo[i - lag];
    if (s > mejor) {
      mejor = s;
      mejorLag = lag;
    }
  }
  const bpm = mejorLag ? (fps * 60) / mejorLag : 0;
  return { bpm, rms, punch };
}

const rutaCreditos = join(dir, "creditos.json");
const creditos = existsSync(rutaCreditos)
  ? Object.fromEntries(JSON.parse(readFileSync(rutaCreditos, "utf8")).map((c) => [c.archivo, c]))
  : {};

const filas = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".mp3"))) {
  try {
    const m = medir(pcm(join(dir, f)));
    // RMS ideal ~0.12: bastante cuerpo, pero cabe debajo de la narración.
    const puntaje = m.bpm / 160 + m.punch / 12 - Math.abs(m.rms - 0.12) * 6;
    filas.push({ id: f.replace(".mp3", ""), credito: creditos[f], ...m, puntaje });
  } catch (e) {
    console.error(f, String(e.message).slice(0, 80));
  }
}

filas.sort((a, b) => b.puntaje - a.puntaje);
console.table(
  filas.map((r) => ({
    id: r.id,
    titulo: r.credito ? `${r.credito.titulo} — ${r.credito.autor}`.slice(0, 44) : "",
    licencia: r.credito ? (r.credito.licencia.startsWith("CC0") ? "CC0" : "BY") : "",
    bpm: r.bpm.toFixed(1),
    rms: r.rms.toFixed(3),
    punch: r.punch.toFixed(1),
    puntaje: r.puntaje.toFixed(2),
  }))
);
