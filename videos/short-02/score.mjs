// Partitura de «El diff de píxeles» (Easybits · compare_render), vertical 1080×1920.
// La voz manda: cada escena mide su frase + un respiro (≥ 1 s de escena completa antes de la cortinilla),
// y cada efecto se ancla a la palabra que lo nombra (voice/lines.json, whisper large-v3 es).
// Todo se cuantiza a dieciseisavos de 120 BPM (0.125 s). De aquí salen la timeline (score.gen.js) y el audio (synth.py).
import { readFileSync, writeFileSync } from "node:fs";

const S16 = 0.125;
const q = (x) => +(Math.round(x / S16) * S16).toFixed(4);
const qUp = (x) => +(Math.ceil(x / S16 - 1e-9) * S16).toFixed(4);
const LINES = JSON.parse(readFileSync(new URL("./voice/lines.json", import.meta.url)));
const L = Object.fromEntries(LINES.map((l) => [l.scene, l]));
const ORDER = ["pregunta", "foto", "delata", "trampas", "fiel", "cta"];
const VO = { pregunta: 0.35 };                       // en las demás, la voz entra 0.55 s después del corte
const TAIL = { pregunta: 1.1, foto: 1.1, delata: 1.4, trampas: 1.3, fiel: 1.5, cta: 2.6 };
// glifo que sella cada cortinilla (la escena que ENTRA)
const GLYPH = { foto: "?", delata: "≠", trampas: "≠", fiel: "=", cta: "✓" };

let t0 = 0; const SCENES = [];
for (const id of ORDER) {
  const vo = VO[id] ?? 0.55;
  const len = qUp(vo + L[id].dur + TAIL[id]);
  SCENES.push({ id, t0, t1: +(t0 + len).toFixed(4), voice: +(t0 + vo).toFixed(4), glyph: GLYPH[id] ?? null });
  t0 = +(t0 + len).toFixed(4);
}
const DURATION = t0;
const SC = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const W = (scene, which, edge = "s", nth = 0) => {
  const ws = L[scene].words;
  const hits = ws.filter((x) => norm(x.w).startsWith(norm(which)));
  const w = hits[nth];
  if (!w) throw new Error(`palabra «${which}» no está en ${scene}`);
  return SC[scene].voice + (edge === "s" ? w.s : w.e);
};

// ---- momentos visuales, anclados a la voz ----
const T = {
  tag1: q(W("pregunta", "copio")),
  perfecta: q(W("foto", "perfecta")),
  flash: q(W("foto", "foto")),
  scan: q(W("delata", "delata")),
  stamp: q(W("delata", "texto", "s", 1)),
  tag37: q(W("delata", "texto", "e", 1) + 0.35),
  trap: [q(W("trampas", "palabra")), q(W("trampas", "fuente")), q(W("trampas", "logo"))],
  fan: q(W("trampas", "todas")),
  clean: q(W("fiel", "fiel")),
  countEnd: q(W("fiel", "desaparece", "e")),
  check: q(W("fiel", "desaparece", "e") + 0.2),
  ctaCheck: q(W("cta", "igual")),
  logo: q(W("cta", "pruebalo")),
  url: q(W("cta", "easybits")),
};

// ---- subtítulos karaoke: una línea a la vez, literal; cortes a mano en frontera de sentido (≤ 21 caracteres a 72 px) ----
const SHOW = { div: "diff", "div,": "diff" }; // whisper oye «div»; en pantalla va el término correcto
const CHUNK = { pregunta: [3, 3, 3], foto: [2, 3, 4], delata: [4, 2, 5], trampas: [3, 3, 3, 3], fiel: [3, 2, 3], cta: [5, 2, 2, 1] };
const CAPS = [];
for (const id of ORDER) {
  const ws = L[id].words, v = SC[id].voice;
  if (CHUNK[id].reduce((a, b) => a + b, 0) !== ws.length) throw new Error(`CHUNK de ${id} no suma ${ws.length} palabras`);
  let k = 0;
  for (const n of CHUNK[id]) {
    const words = ws.slice(k, k + n).map((w) => ({ w: SHOW[w.w.toLowerCase()] ?? w.w, t: +(v + w.s).toFixed(3), e: +(v + w.e).toFixed(3) }));
    const text = words.map((w) => w.w).join(" ");
    if (text.length > 21) throw new Error(`línea demasiado ancha: «${text}»`);
    CAPS.push({ t: words[0].t, t1: words[words.length - 1].e, words });
    k += n;
  }
}
// cada línea se queda hasta que entra la siguiente (o hasta el corte de su escena)
CAPS.forEach((c, i) => {
  const sc = SCENES.find((s) => c.t >= s.t0 && c.t < s.t1);
  const next = CAPS[i + 1];
  c.until = +Math.min(next ? next.t : DURATION, sc.t1 - 0.45).toFixed(3);
});

// ---- efectos: pocos, uno por cambio visible, en el mismo cuadro ----
const sfx = [];
const fx = (t, inst, note = null, dur = 0.3, vel = 0.7) => sfx.push({ t: +t.toFixed(4), inst, note, dur, vel });
fx(T.tag1, "pop", null, 0.09, 0.9);
fx(T.perfecta, "marimba", 76, 0.4, 0.6);
fx(T.flash, "click", 84, 0.06, 1.0);                           // obturador
[60, 64, 67, 72].forEach((n, i) => fx(T.scan + i * 0.18, "pluck", n, 0.5, 0.55)); // el barrido rojo baja: un solo gesto
fx(T.stamp, "stamp", null, 0.4, 1.0);
fx(T.tag37, "pop", null, 0.09, 0.8);
T.trap.forEach((k, i) => fx(k, "marimba", [67, 71, 74][i], 0.45, 0.65));
[62, 67, 71, 74].forEach((n, i) => fx(T.fan + i * 0.04, "pluck", n, 0.7, 0.55));
[79, 76, 72, 67, 64, 60].forEach((n, i) => fx(T.clean + i * ((T.countEnd - T.clean) / 6), "marimba", n, 0.3, 0.45)); // la cuenta baja a 0
fx(T.check, "knock", null, 0.35, 0.9); [72, 76, 79].forEach((n) => fx(T.check + 0.02, "marimba", n, 0.7, 0.55));
fx(T.ctaCheck, "pop", null, 0.09, 0.8);
[84, 88, 91, 96].forEach((n, i) => fx(T.logo + i * 0.09, "bell", n, 1.6, 0.22)); // brillo del logo (única campana)
fx(T.url, "click", 79, 0.06, 0.7);
SCENES.slice(1).forEach((s) => fx(s.t0 - 0.32, "sweep", null, 0.34, 0.32)); // el viento, sólo en las cortinillas

// ---- cama: acordes cada 2 compases, bombo suave, melodía discreta ----
const bed = [], pads = [];
const PROG = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
for (let st = 0; st < DURATION; st += 4) {
  const notes = st >= SC.cta.t0 - 0.01 ? [48, 55, 64, 72] : PROG[(st / 4) % 4];
  pads.push({ t: st, notes, dur: +Math.min(4, DURATION - st).toFixed(4) });
}
for (let x = 0; x < SC.cta.t0; x += 1) bed.push({ t: x, inst: "kick", note: null, dur: 0.3, vel: x % 2 === 0 ? 0.4 : 0.28 });
const PHRASE = [67, null, 72, 74, 76, null, 74, 72, 69, null, 72, null, 67, 69, 72, null];
for (let k = 0; k * 0.5 < SC.cta.t0; k++) {
  const x = k * 0.5, n = PHRASE[k % PHRASE.length];
  const near = sfx.some((e) => e.inst !== "sweep" && Math.abs(e.t - x) < 0.3);
  if (n && !near) bed.push({ t: x, inst: "marimba", note: n, dur: 0.4, vel: 0.16 });
}

// los efectos que caen mientras habla la voz suben para no quedar tapados
const speaking = (x) => LINES.some((l) => { const v = SC[l.scene].voice; return l.words.some((w) => x >= v + w.s - 0.05 && x <= v + w.e + 0.05); });
sfx.forEach((e) => { if (e.inst !== "sweep" && speaking(e.t)) e.vel = +Math.min(2.4, e.vel * 2.6).toFixed(2); });
sfx.sort((a, b) => a.t - b.t); bed.sort((a, b) => a.t - b.t);
const voice = SCENES.map((s) => ({ t: s.voice, file: L[s.id].file }));
writeFileSync(new URL("./score.gen.json", import.meta.url), JSON.stringify({ duration: DURATION, scenes: SCENES, T, caps: CAPS, sfx, bed, pads, voice }, null, 1));
writeFileSync(new URL("./score.gen.js", import.meta.url), `// generado por score.mjs\nwindow.SCORE = ${JSON.stringify({ duration: DURATION, scenes: SCENES, T, caps: CAPS })};\n`);
console.log(`${DURATION} s · ${sfx.length} efectos · ${bed.length} notas de cama · ${CAPS.length} líneas de subtítulo`);
console.log(SCENES.map((s) => `${s.id} ${s.t0}–${s.t1}`).join(" · "));
console.log(CAPS.map((c) => c.words.map((w) => w.w).join(" ")).join(" | "));
