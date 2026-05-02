import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useState } from "react";
import { formatMxn } from "~/lib/quiz/pricing";

type RunningTotalProps = {
  monthlyTotalMxn: number;
  setupOneTimeMxn: number;
};

export const RunningTotal = ({
  monthlyTotalMxn,
  setupOneTimeMxn,
}: RunningTotalProps) => {
  const reduced = useReducedMotion();
  const setupCount = useMotionValue(setupOneTimeMxn);
  const setupRounded = useTransform(setupCount, (v) => Math.round(v));
  const [setupDisplay, setSetupDisplay] = useState(setupOneTimeMxn);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (reduced) {
      setSetupDisplay(setupOneTimeMxn);
      setupCount.set(setupOneTimeMxn);
      return;
    }
    const controls = animate(setupCount, setupOneTimeMxn, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = setupRounded.on("change", (v) => setSetupDisplay(v));
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 600);
    return () => {
      controls.stop();
      unsub();
      window.clearTimeout(t);
    };
  }, [setupOneTimeMxn, reduced]);

  return (
    <div className="text-center mt-6 font-mono tabular-nums leading-snug">
      <p className="text-sm text-black/60">
        acumulado: {formatMxn(monthlyTotalMxn)} / mes
      </p>
      <p
        className={`text-xs mt-0.5 transition-colors duration-300 ${
          pulse ? "text-black font-bold" : "text-black/55"
        }`}
      >
        setup único: {formatMxn(setupDisplay)} MXN
      </p>
    </div>
  );
};
