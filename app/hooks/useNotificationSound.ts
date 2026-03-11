let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    if (ctx.state === "suspended") return null;
  }
  return ctx;
}

export function playTone() {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = 700;
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.15);
}
