import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState } from "react";
import type { Quote } from "~/lib/quiz/pricing";
import { formatMxn } from "~/lib/quiz/pricing";

type PriceSummaryProps = {
  quote: Quote;
  customIntegrationsDescription?: string;
};

export const PriceSummary = ({
  quote,
  customIntegrationsDescription,
}: PriceSummaryProps) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDisplay(quote.totalMxn);
      count.set(quote.totalMxn);
      return;
    }
    const controls = animate(count, quote.totalMxn, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [quote.totalMxn, reduced]);

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
          {quote.selectionsCount === 1 ? "capacidad" : "capacidades"}
          {quote.hasCustomIntegrations && " · integraciones custom"} ·
          orquestación
        </p>
      </div>

      <div className="rounded-2xl border-[3px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
        <h4 className="text-sm uppercase tracking-widest font-bold text-black mb-4">
          Desglose mensual
        </h4>
        <ul className="flex flex-col gap-3">
          {/* Orchestration line */}
          <motion.li
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="border-b border-black/10 pb-3"
          >
            <div className="flex justify-between items-baseline gap-3">
              <span className="text-sm font-bold text-black">
                Orquestación + soporte humano
              </span>
              <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                {formatMxn(quote.orchestrationFeeMxn)}
              </span>
            </div>
            <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
              <li>Setup inicial y configuración de vendors</li>
              <li>Soporte humano cuando algo falla</li>
              <li>Monitoreo y mantenimiento</li>
            </ul>
          </motion.li>

          {/* Each capability */}
          {quote.breakdown.map((line, i) => (
            <motion.li
              key={line.capability.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              className="border-b border-black/10 pb-3"
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-sm font-bold text-black flex items-center gap-2">
                  <span aria-hidden>{line.capability.emoji}</span>
                  <span>{line.capability.shortLabel}</span>
                  <span className="text-black/40 text-xs font-normal">
                    ({line.capability.vendor})
                  </span>
                </span>
                <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                  {formatMxn(line.priceMxn)}
                </span>
              </div>
              <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
                {line.capability.includes.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </motion.li>
          ))}

          {/* Custom integrations (optional) */}
          {quote.hasCustomIntegrations && (
            <motion.li
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + quote.breakdown.length * 0.04 }}
              className="border-b border-black/10 pb-3"
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-sm font-bold text-black flex items-center gap-2">
                  <span aria-hidden>🔌</span>
                  <span>
                    Integraciones custom
                    <span className="text-brand-red ml-0.5">*</span>
                  </span>
                </span>
                <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                  {formatMxn(quote.customIntegrationsMxn)}
                </span>
              </div>
              {customIntegrationsDescription && (
                <p className="mt-1.5 text-xs text-black/70 italic">
                  “{customIntegrationsDescription}”
                </p>
              )}
              <p className="mt-1.5 text-xs text-black/60">
                <span className="text-brand-red">*</span> estimado preliminar —
                se ajusta tras revisar tus APIs en la llamada
              </p>
            </motion.li>
          )}

          {/* Total */}
          <motion.li
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: 0.15 + quote.breakdown.length * 0.04 + 0.1,
            }}
            className="flex justify-between items-baseline pt-1"
          >
            <span className="text-base font-black">Total mensual</span>
            <span className="font-mono font-black text-base tabular-nums">
              {formatMxn(quote.totalMxn)}
            </span>
          </motion.li>
        </ul>

        <p className="mt-4 pt-3 border-t border-black/10 text-xs text-black/50">
          Precios en MXN, no incluyen IVA. Suscripción mensual, cancela cuando
          quieras.
        </p>
      </div>
    </div>
  );
};
