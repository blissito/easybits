import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect, useState } from "react";
import type { Quote } from "~/lib/quiz/pricing";
import { formatMxn } from "~/lib/quiz/pricing";

type PriceSummaryProps = {
  quote: Quote;
};

export const PriceSummary = ({ quote }: PriceSummaryProps) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(count, quote.totalMxn, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [quote.totalMxn]);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-sm uppercase tracking-widest font-bold text-black/60 mb-2">
          Tu agente custom
        </p>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-6xl md:text-7xl font-black text-black tabular-nums">
            {formatMxn(display)}
          </span>
          <span className="text-xl font-bold text-black/60">/ mes</span>
        </div>
        <p className="text-sm text-black/60 mt-3">
          {quote.selectionsCount}{" "}
          {quote.selectionsCount === 1 ? "capacidad" : "capacidades"} +
          orquestación
        </p>
      </div>

      <div className="rounded-2xl border-[3px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
        <h4 className="text-sm uppercase tracking-widest font-bold text-black mb-4">
          Desglose mensual
        </h4>
        <ul className="flex flex-col gap-2">
          <motion.li
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex justify-between items-center text-sm border-b border-black/10 pb-2"
          >
            <span className="text-black/80">
              Orquestación + soporte humano
            </span>
            <span className="font-mono font-bold">
              {formatMxn(quote.orchestrationFeeMxn)}
            </span>
          </motion.li>
          {quote.breakdown.map((line, i) => (
            <motion.li
              key={line.capability.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="flex justify-between items-center text-sm border-b border-black/10 pb-2"
            >
              <span className="text-black/80 flex items-center gap-2">
                <span aria-hidden>{line.capability.emoji}</span>
                {line.capability.shortLabel}
                <span className="text-black/40 text-xs">
                  ({line.capability.vendor})
                </span>
              </span>
              <span className="font-mono font-bold">
                {formatMxn(line.priceMxn)}
              </span>
            </motion.li>
          ))}
          <motion.li
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 + quote.breakdown.length * 0.05 + 0.1 }}
            className="flex justify-between items-center text-base font-black pt-2"
          >
            <span>Total mensual</span>
            <span className="font-mono">{formatMxn(quote.totalMxn)}</span>
          </motion.li>
        </ul>
      </div>
    </div>
  );
};
