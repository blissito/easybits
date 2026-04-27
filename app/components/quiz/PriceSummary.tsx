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
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
  disableDownload?: boolean;
};

const DISCOUNT_PCT = 20;

export const PriceSummary = ({
  quote,
  customIntegrationsDescription,
  onDownloadPdf,
  isDownloadingPdf = false,
  disableDownload = false,
}: PriceSummaryProps) => {
  const discountedTotal = Math.round(
    quote.totalMxn * (1 - DISCOUNT_PCT / 100)
  );
  const savingMxn = quote.totalMxn - discountedTotal;

  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDisplay(discountedTotal);
      count.set(discountedTotal);
      return;
    }
    const controls = animate(count, discountedTotal, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [discountedTotal, reduced]);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-sm uppercase tracking-widest font-bold text-black/60 mb-3">
          Tu agente custom
        </p>

        {/* 20% Discount badge — brutalist sticker */}
        <motion.div
          initial={reduced ? false : { scale: 0.5, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { delay: 0.3, type: "spring", stiffness: 200, damping: 12 }
          }
          className="inline-block mb-3 bg-brand-yellow border-[3px] border-black px-4 py-1.5 rounded-lg shadow-[3px_3px_0_0_rgba(0,0,0,1)]"
        >
          <span className="text-xs md:text-sm font-black tracking-[0.2em] uppercase text-black">
            ★ {DISCOUNT_PCT}% Descuento permanente ★
          </span>
        </motion.div>

        {/* Original total — struck through, smaller */}
        <div className="text-xl md:text-2xl font-bold text-black/40 tabular-nums line-through mt-1">
          {formatMxn(quote.totalMxn)} MXN
        </div>

        {/* Discounted total — BIG in brand accent purple */}
        <div className="flex items-baseline justify-center gap-2 mt-1">
          <span className="text-6xl md:text-7xl font-black text-brand-500 tabular-nums">
            {formatMxn(display)}
          </span>
          <span className="text-xl font-bold text-black/60">
            MXN / mes
          </span>
        </div>

        <p className="text-sm text-black/60 mt-3">
          {quote.selectionsCount}{" "}
          {quote.selectionsCount === 1 ? "capacidad" : "capacidades"}
          {quote.hasCustomIntegrations && " · integraciones custom"} ·
          orquestación
        </p>
        <p className="text-xs text-black/55 mt-1.5 font-mono">
          Ahorras {formatMxn(savingMxn)} MXN cada mes — al presentar tu
          cotización
        </p>
      </div>

      {/* Discount + Download banner — positioned right under the price */}
      {onDownloadPdf && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced ? { duration: 0 } : { delay: 0.5, duration: 0.4 }
          }
          className="mb-8 rounded-2xl border-[3px] border-black bg-brand-yellow p-5 md:p-6 shadow-[5px_5px_0_0_rgba(0,0,0,1)] text-center"
        >
          <p className="text-[10px] md:text-xs uppercase tracking-[0.25em] font-black text-black/70 mb-2">
            ★ Descuento permanente ★
          </p>
          <p className="text-base md:text-lg font-black text-black leading-tight">
            Descarga tu cotización y preséntala para recibir
            <br className="hidden md:block" />{" "}
            <span className="underline decoration-4 underline-offset-2">
              {DISCOUNT_PCT}% de descuento permanente
            </span>{" "}
            al contratar.
          </p>
          <button
            onClick={onDownloadPdf}
            disabled={disableDownload || isDownloadingPdf}
            className="mt-4 inline-flex items-center gap-2 bg-black text-white font-bold text-sm md:text-base px-5 py-3 rounded-xl border-[3px] border-black hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDownloadingPdf ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generando tu cotización…</span>
              </>
            ) : (
              "↓ Descargar cotización (PDF)"
            )}
          </button>
          {isDownloadingPdf && (
            <p className="text-[10px] text-black/55 mt-2 font-mono">
              Tarda 2-4 segundos
            </p>
          )}
        </motion.div>
      )}

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
                  {line.priceMxn === 0 ? "Incluido" : formatMxn(line.priceMxn)}
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
