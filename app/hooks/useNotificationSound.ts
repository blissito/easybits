let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function doPlay(ac: AudioContext, opts?: { freq?: number; vol?: number; duration?: number }) {
  const freq = opts?.freq ?? 700;
  const vol = opts?.vol ?? 0.18;
  const dur = opts?.duration ?? 0.15;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur);
}

/** Call on any user gesture to ensure AudioContext is ready */
export function warmAudio() {
  const ac = ensureCtx();
  if (ac.state === "suspended") ac.resume().catch(() => {});
}

export function playTone(opts?: { freq?: number; vol?: number; duration?: number }) {
  const ac = ensureCtx();
  if (ac.state === "suspended") {
    ac.resume().then(() => doPlay(ac, opts)).catch(() => {});
  } else {
    doPlay(ac, opts);
  }
}
