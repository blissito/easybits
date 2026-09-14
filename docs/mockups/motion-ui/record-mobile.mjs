// Graba un ciclo completo (24 s) de mobile-agent.html a 1125×2436 con Playwright + Chrome del sistema,
// vuelca los eventos del guion (window.__events) y monta los SFX con ffmpeg (el render sale mudo).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, '_rec');
const LOOP = 24;
fs.rmSync(outDir, { recursive: true, force: true });

const recordStart = Date.now();
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1125, height: 2436 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: 1125, height: 2436 } },
});
const page = await context.newPage();
await page.goto('file://' + path.join(dir, 'mobile-agent.html?manual=1'));
await page.addStyleTag({ content: 'html{zoom:3} .app{max-height:none}' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
const t0 = Date.now();
await page.evaluate(() => window.startLoop());
await page.waitForTimeout(LOOP * 1000);
const events = await page.evaluate(() => window.__events);
const video = page.video();
await context.close();
await browser.close();
fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events, null, 1));

const raw = await video.path();
const webm = path.join(dir, 'mobile-agent.webm');
const mute = path.join(dir, '_mute.mp4');
const mp4 = path.join(dir, 'mobile-agent.mp4');
fs.renameSync(raw, webm);
fs.rmSync(outDir, { recursive: true, force: true });

// Recorta desde que arranca el bucle y encodea h264 a ancho par
const offset = (t0 - recordStart) / 1000;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-ss', String(offset), '-t', String(LOOP),
  '-vf', 'pad=1126:2436:0:0:#0b0b0f', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '20', '-an', mute]);

// ---- SFX: cada evento del guion → un sonido en su instante (adelay en ms), todo con apad y limiter ----
const SFX = {                        // [archivo, ganancia, desfase en s]
  title:   [['pop', 0.5, 0]],
  key:     [['tick', 0.22, 0]],
  send:    [['whoosh-short', 0.6, 0]],
  agent:   [['pop', 0.45, 0]],
  caja:    [['coin', 0.7, 0.25]],                      // el rebote asienta a ~1/(s+1) del tween
  ghosty:  [['whoosh-fly', 0.6, 0], ['land', 0.8, 0.6]],
  wipe:    [['riser', 0.7, 0], ['hit-low', 0.9, 0.45]],
  'cta-in':[['pop', 0.6, 0.75]],
  render:  [['8bit-blip', 0.35, 0.3], ['8bit-blip', 0.35, 0.8], ['8bit-blip', 0.35, 1.3], ['8bit-blip', 0.35, 1.8]],
  done:    [['ding', 0.8, 0], ['paper', 0.5, 0.05]],
};
const inputs = [], chains = [];
let n = 0;
for (const ev of events) {
  for (const [file, gain, off] of SFX[ev.kind] || []) {
    const t = ev.t + off; if (t < 0 || t > LOOP) continue;
    inputs.push('-i', path.join(dir, 'lib/sfx', file + '.wav'));
    chains.push(`[${n + 1}:a]volume=${gain},adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)},apad=whole_dur=${LOOP}[s${n}]`);
    n++;
  }
}
const mix = chains.map((_, i) => `[s${i}]`).join('') + `amix=inputs=${n}:normalize=0,alimiter=limit=0.89,atrim=0:${LOOP}[out]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mute, ...inputs,
  '-filter_complex', chains.join(';') + ';' + mix,
  '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(LOOP), mp4]);
fs.rmSync(mute);
console.log('ok:', mp4, 'eventos', events.length, 'sfx', n, 'offset', offset.toFixed(2));
