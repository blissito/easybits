// Lightweight UI sounds via Web Audio API — no network, instant.
// Initializes on first user interaction (browser autoplay policy).

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  // Resume if suspended (user gesture required first time)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

type ToneOpts = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  delay?: number;
  gain?: number;
};

const scheduleTone = (
  ctx: AudioContext,
  { freq, duration, type = "sine", delay = 0, gain = 0.08 }: ToneOpts
) => {
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = type;
    osc.connect(g);
    g.connect(ctx.destination);
    // Min 5ms forward — evita que la nota se programe en el pasado cuando
    // el AudioContext acaba de despertarse del estado suspended.
    const startAt = ctx.currentTime + Math.max(delay, 0.005);
    g.gain.setValueAtTime(gain, startAt);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration);
  } catch {
    /* swallow — best-effort UI sound */
  }
};

const playTone = (opts: ToneOpts) => {
  const ctx = getCtx();
  if (!ctx) return;
  // Si el contexto está suspended (autoplay policy o mobile aggressive
  // suspension), esperamos al resume antes de programar la nota — si no,
  // se pierde silenciosamente.
  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => scheduleTone(ctx, opts))
      .catch(() => {});
  } else {
    scheduleTone(ctx, opts);
  }
};

/** Positive ascending chime — C5 → E5 → G5 quick arpeggio */
export const playYes = () => {
  playTone({ freq: 523.25, duration: 0.12, type: "sine" });
  playTone({ freq: 659.25, duration: 0.14, type: "sine", delay: 0.05 });
  playTone({ freq: 783.99, duration: 0.18, type: "sine", delay: 0.1 });
};

/** Soft decline — single low triangle wave, gentle (not punishing) */
export const playNo = () => {
  playTone({ freq: 220, duration: 0.14, type: "triangle", gain: 0.06 });
};

/** Summary reveal — full major chord (C-E-G + octave) */
export const playReveal = () => {
  playTone({ freq: 523.25, duration: 0.5, type: "sine", gain: 0.08 });
  playTone({ freq: 659.25, duration: 0.5, type: "sine", gain: 0.07 });
  playTone({ freq: 783.99, duration: 0.5, type: "sine", gain: 0.07 });
  playTone({
    freq: 1046.5,
    duration: 0.6,
    type: "sine",
    delay: 0.08,
    gain: 0.05,
  });
};
