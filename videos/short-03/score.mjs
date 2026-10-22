// Partitura de «Manda push» (Easybits · short-03, brutalista), vertical 1080×1920.
// La voz manda: cada escena mide su frase + un respiro; cada efecto se ancla a la palabra que lo nombra
// (voice/lines.json, whisper large-v3 es). Cuantizado a dieciseisavos de 120 BPM (0.125 s).
import { readFileSync, writeFileSync } from "node:fs";

const S16 = 0.125;
const q = (x) => +(Math.round(x / S16) * S16).toFixed(4);
const qUp = (x) => +(Math.ceil(x / S16 - 1e-9) * S16).toFixed(4);
const LINES = JSON.parse(readFileSync(new URL("./voice/lines.json", import.meta.url)));
const L = Object.fromEntries(LINES.map((l) => [l.scene, l]));
const ORDER = ["empuja", "carton", "vacio", "maquina", "stacks", "agente", "cta"];
// empuja → carton → vacio son UNA toma continua (la fachada cae y queda el vacío): sin cortinilla entre ellas
const VO = { empuja: 0.35, carton: 0.2, vacio: 0.25, cta: 1.75 }; // en el cierre, el soplo va antes de la voz
const TAIL = { empuja: 0.2, carton: 0.2, vacio: 1.1, maquina: 1.2, stacks: 1.3, agente: 1.1, cta: 2.6 };
const GLYPH = { maquina: "logo", stacks: "logo", agente: "logo", cta: "logo" };
const VIS = { empuja: "A", carton: "A", vacio: "A" };   // escena visual (contenedor en index.html)

let t0 = 0; const SCENES = [];
for (const id of ORDER) {
  const vo = VO[id] ?? 0.55;
  const len = qUp(vo + L[id].dur + TAIL[id]);
  SCENES.push({ id, vis: VIS[id] ?? id, t0, t1: +(t0 + len).toFixed(4), voice: +(t0 + vo).toFixed(4), glyph: GLYPH[id] ?? null });
  t0 = +(t0 + len).toFixed(4);
}
const DURATION = t0;
const SC = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const W = (scene, which, edge = "s", nth = 0) => {
  const ws = L[scene].words;
  const hits = ws.filter((x) => norm(x.w).startsWith(norm(which)));
  const w = hits[nth];
  if (!w) throw new Error(`palabra «${which}» no está en ${scene}`);
  return SC[scene].voice + (edge === "s" ? w.s : w.e);
};

// ---- momentos visuales, anclados a la voz ----
const T = {
  hand: 0.35,
  push: q(W("empuja", "trafico")),
  land: q(W("empuja", "trafico") + 0.62),
  carton: q(W("carton", "carton")),
  x: [q(W("vacio", "servidor")), q(W("vacio", "base")), q(W("vacio", "dominio"))],
  bonita: q(W("vacio", "pagina")),
  negocio: q(W("vacio", "negocio")),
  box: q(W("maquina", "maquina")),
  bricks: [q(W("maquina", "servidor")), q(W("maquina", "base")), q(W("maquina", "archivos")), q(W("maquina", "dominio")), q(W("maquina", "whatsapp"))],
  dom: q(W("stacks", "framework")),
  pub: q(W("stacks", "publicado")),
  pubEnd: q(W("stacks", "segundos", "e")),
  lock: q(W("agente", "encierra")),
  unlock: q(W("agente", "chat")),
  type: q(W("agente", "manejas")),
  logo: q(W("cta", "easybits")),
  abre: q(W("cta", "abre")),
  hoy: q(W("cta", "hoy")),
  url: q(W("cta", "easybits", "s", 1)),
};
T.blow2 = q(SC.cta.t0 + 0.75);
T.typeEnd = q(Math.min(SC.agente.t1 - 0.5, T.type + 1.6));

// ---- subtítulos karaoke: una línea a la vez, literal; cortes a mano (≤ 21 caracteres a 72 px) ----
// la marca se escribe Easybits
const SHOW = { easybits: "Easybits", "easybits,": "Easybits,", "easybits.cloud.": "easybits.cloud." };
const FIX = { empuja: { 5: "¿aguanta", 8: "verdad?" }, agente: { 0: "Y" } }; // por posición: whisper se come los signos y oye «Si» por «Y»
const CHUNK = { empuja: [4, 3, 2], carton: [4, 3, 3], vacio: [2, 4, 2, 3, 4], maquina: [4, 3, 3, 2, 2, 2], stacks: [3, 2, 3], agente: [4, 3, 3, 3], cta: [3, 3, 4, 2] };
const CAPS = [];
for (const id of ORDER) {
  const ws = L[id].words, v = SC[id].voice;
  if (CHUNK[id].reduce((a, b) => a + b, 0) !== ws.length) throw new Error(`CHUNK de ${id} no suma ${ws.length} palabras`);
  let k = 0;
  for (const n of CHUNK[id]) {
    const words = ws.slice(k, k + n).map((w, j) => {
      const fix = FIX[id]?.[k + j];
      if (fix === null) return null;
      return { w: fix ?? SHOW[w.w.toLowerCase()] ?? w.w, t: +(v + w.s).toFixed(3), e: +(v + w.e).toFixed(3) };
    }).filter(Boolean);
    const text = words.map((w) => w.w).join(" ");
    if (text.length > 21) throw new Error(`línea demasiado ancha: «${text}»`);
    CAPS.push({ t: words[0].t, t1: words[words.length - 1].e, words });
    k += n;
  }
}
CAPS.forEach((c, i) => {
  const sc = SCENES.find((s) => c.t >= s.t0 && c.t < s.t1);
  const next = CAPS[i + 1];
  const nextScene = SCENES[SCENES.indexOf(sc) + 1];
  const cut = nextScene && nextScene.glyph ? sc.t1 - 0.45 : DURATION; // sólo se corta antes de una cortinilla
  c.until = +Math.min(next ? next.t : DURATION, cut).toFixed(3);
});

// ---- efectos: uno por cambio visible, en el mismo cuadro, nunca el mismo dos veces seguidas ----
const sfx = [];
const fx = (t, inst, note = null, dur = 0.3, vel = 0.7) => sfx.push({ t: +t.toFixed(4), inst, note, dur, vel });
fx(T.hand + 0.12, "pop", null, 0.09, 0.8);                      // la nube entra (back.out 1.6 → impacto a 0.38 del tween)
fx(T.push, "sweep", null, 0.7, 0.6);                            // la ráfaga de tráfico
fx(T.push + 0.08, "pluck", 55, 0.6, 0.6);                       // la fachada se va de lado (cae)
fx(T.land, "knock", null, 0.35, 1.0);                           // toca el piso
fx(T.carton, "stamp", null, 0.4, 1.0);                          // sello UTILERÍA
T.x.forEach((t, i) => { fx(t, "marimba", [67, 64, 60][i], 0.4, 0.6); fx(t + 0.22, "click", [88, 84, 79][i], 0.05, 0.6); }); // cae etiqueta + tachón
fx(T.negocio, "boing", 50, 0.5, 0.6);
fx(T.box, "knock", null, 0.35, 0.9);                            // cae la máquina
T.bricks.forEach((t, i) => fx(t, "marimba", [60, 64, 67, 71, 74][i], 0.35, 0.6)); // ladrillos, tono subiendo
[0, 1, 2, 3, 4, 5, 6].forEach((i) => fx(T.dom + i * 0.09, "pluck", 62 + i * 2, 0.25, 0.5)); // fichas de dominó
for (let x = T.pub; x < T.pubEnd - 0.05; x += 0.125) fx(x, "hat", null, 0.03, 0.5);        // cronómetro
fx(T.pubEnd, "bell", 84, 1.2, 0.5);
fx(T.lock, "pop", null, 0.09, 0.8);
fx(T.unlock, "click", 76, 0.06, 0.9); fx(T.unlock + 0.05, "marimba", 79, 0.4, 0.5);
for (let x = T.type; x < T.typeEnd; x += 0.0625) fx(x, "hat", null, 0.02, 0.35); // tecleo
fx(T.typeEnd, "pop", null, 0.09, 0.8);
for (let x = T.blow2; x < T.blow2 + 0.45; x += 0.0625) fx(x, "hat", null, 0.05, 0.45); // soplo contra el ladrillo
fx(T.blow2 + 0.55, "boing", 43, 0.4, 0.5);                    // la nube se desinfla
fx(T.logo, "knock", null, 0.3, 0.7); [84, 88, 91, 96].forEach((n, i) => fx(T.logo + 0.1 + i * 0.09, "bell", n, 1.6, 0.22));
fx(T.abre, "marimba", 72, 0.5, 0.6);
fx(T.hoy, "stamp", null, 0.4, 0.9);
fx(T.url, "click", 79, 0.06, 0.7);
SCENES.filter((s) => s.glyph).forEach((s) => fx(s.t0 - 0.32, "sweep", null, 0.34, 0.32)); // viento sólo en las cortinillas

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
