import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState } from "react";
import type { Quote } from "~/lib/quiz/pricing";
import {
  computeDiscountedMonthly,
  formatMxn,
  formatUsd,
  QUOTE_DISCOUNT_PCT,
} from "~/lib/quiz/pricing";
import type { Capability } from "~/lib/quiz/capabilities";

type PriceSummaryProps = {
  quote: Quote;
  customIntegrationsDescription?: string;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
  disableDownload?: boolean;
  availableToAdd?: Capability[];
  onAddCapability?: (capId: string) => void;
  onRemoveCapability?: (capId: string) => void;
  onRemoveCustomIntegrations?: () => void;
  siteAnalysisCaptured?: boolean;
};

export const PriceSummary = ({
  quote,
  customIntegrationsDescription,
  onDownloadPdf,
  isDownloadingPdf = false,
  disableDownload = false,
  availableToAdd = [],
  onAddCapability,
  onRemoveCapability,
  onRemoveCustomIntegrations,
  siteAnalysisCaptured = false,
}: PriceSummaryProps) => {
  // El descuento aplica SOLO al mensual, no al setup. El setup es ancla.
  const discountedMonthly = computeDiscountedMonthly(quote.monthlyTotalMxn);
  const monthlySaving = quote.monthlyTotalMxn - discountedMonthly;

  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDisplay(discountedMonthly);
      count.set(discountedMonthly);
      return;
    }
    const controls = animate(count, discountedMonthly, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [discountedMonthly, reduced]);

  const removable = !!onRemoveCapability;
  const canAdd = !!onAddCapability && availableToAdd.length > 0;

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
            ★ {QUOTE_DISCOUNT_PCT}% Descuento permanente en mensualidad ★
          </span>
        </motion.div>

        {/* Original monthly — struck through, smaller */}
        <div className="text-xl md:text-2xl font-bold text-black/40 tabular-nums line-through mt-1">
          {formatMxn(quote.monthlyTotalMxn)} MXN / mes
        </div>

        {/* Discounted monthly — BIG in brand accent purple */}
        <div className="flex items-baseline justify-center gap-2 mt-1">
          <span className="text-6xl md:text-7xl font-black text-brand-500 tabular-nums">
            {formatMxn(display)}
          </span>
          <span className="text-xl font-bold text-black/60">
            MXN / mes
          </span>
        </div>

        <p className="text-sm text-black/60 mt-3 max-w-md mx-auto leading-snug">
          {quote.selectionsCount}{" "}
          {quote.selectionsCount === 1 ? "capacidad" : "capacidades"}
          {quote.hasCustomIntegrations && " · integraciones custom"}
          <span className="block mt-1 text-xs italic text-black/55">
            mucho menos que un salario y con más retorno de inversión
          </span>
        </p>
        <p className="text-xs text-black/55 mt-1.5 font-mono">
          Ahorras {formatMxn(monthlySaving)} MXN cada mes — al presentar tu
          cotización
        </p>
      </div>

      {/* SETUP ÚNICO — se cobra junto con la primera mensualidad vía Stripe */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { delay: 0.4, duration: 0.4 }}
        className="mb-6 rounded-2xl border-[3px] border-black bg-black text-white p-6 shadow-[5px_5px_0_0_rgba(0,0,0,1)]"
      >
        <p className="text-[10px] uppercase tracking-[0.25em] font-black text-brand-yellow mb-1">
          Setup único · Pago una sola vez
        </p>
        <p className="text-3xl md:text-4xl font-black tabular-nums">
          {formatMxn(quote.setupOneTimeMxn)}{" "}
          <span className="text-sm font-bold text-white/60">MXN</span>
        </p>
        <p className="text-xs text-white/50 font-mono mt-1">
          ≈ {formatUsd(quote.setupOneTimeUsd)} USD
        </p>
        <p className="text-[10px] text-white/55 mt-1 mb-3 leading-snug">
          Escala según scope: $35K (mínimo) → $50K → $80K → $120K (full).
          Más capacidades, más vendors a configurar.
        </p>
        <ul className="text-xs text-white/80 space-y-1 list-disc list-inside leading-relaxed">
          <li>30 días pair WA con dos seniors</li>
          <li>Setup técnico + MCPs + tu marca</li>
          <li>2 integraciones simples</li>
        </ul>
        <div className="mt-3 pt-3 border-t border-white/15 text-[11px] leading-snug">
          <p className="text-brand-yellow font-bold">
            ✓ Hablamos por WhatsApp antes de cobrar
          </p>
          <p className="text-white/65 mt-0.5">
            Validamos que encajamos. Si no, no hay deal.
          </p>
        </div>
      </motion.div>

      {/* Discount + Download banner — positioned right under setup */}
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
              {QUOTE_DISCOUNT_PCT}% off permanente en mensualidad
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
          {removable && (
            <span className="ml-2 text-[10px] font-normal text-black/45 normal-case tracking-normal">
              · puedes editar
            </span>
          )}
        </h4>
        <ul className="flex flex-col gap-3">
          {/* Orchestration line — NOT removable, base of the bundle */}
          <motion.li
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="border-b border-black/10 pb-3"
          >
            <div className="flex justify-between items-baseline gap-3">
              <span className="text-sm font-bold text-black">
                Operación + babysit del agente
              </span>
              <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                {formatMxn(quote.orchestrationFeeMxn)}
              </span>
            </div>
            <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
              <li>Que el agente no se rompa</li>
              <li>Ajustes que pidas</li>
              <li>Soporte humano, no chatbot</li>
            </ul>
          </motion.li>

          {/* Each capability */}
          {quote.breakdown.map((line, i) => (
            <motion.li
              key={line.capability.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              className="border-b border-black/10 pb-3 group"
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-sm font-bold text-black flex items-center gap-2 flex-wrap">
                  <span aria-hidden>{line.capability.emoji}</span>
                  <span>{line.capability.shortLabel}</span>
                  {line.tierLabel && (
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-black text-white text-[9px] font-black uppercase tracking-wider rounded">
                      {line.tierLabel}
                    </span>
                  )}
                  <span className="text-black/40 text-xs font-normal">
                    ({line.capability.vendor})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                    {line.priceMxn === 0
                      ? "Incluido"
                      : formatMxn(line.priceMxn)}
                  </span>
                  {removable && line.priceMxn > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onRemoveCapability!(line.capability.id)
                      }
                      aria-label={`Quitar ${line.capability.shortLabel}`}
                      title={`Quitar ${line.capability.shortLabel}`}
                      className="w-5 h-5 rounded-full bg-black/10 hover:bg-black hover:text-white text-black/60 text-xs font-black flex items-center justify-center transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
                {line.capability.includes.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
              {/* Cap del tier seleccionado (o del capability si es binaria con consumo variable) */}
              {line.cap && (
                <div className="mt-2 text-[11px] bg-black/5 border border-black/15 rounded-md px-2.5 py-1.5 leading-snug">
                  {line.humanLine && (
                    <p className="text-[12px] font-bold text-black mb-0.5">
                      {line.humanLine}
                    </p>
                  )}
                  <strong className="text-black font-mono">
                    {line.cap.included} {line.cap.unit}
                  </strong>
                  <span className="text-black/55 font-mono">
                    {" "}
                    · exceso: {line.cap.overage}
                  </span>
                </div>
              )}
            </motion.li>
          ))}

          {/* Site analysis — free perk, always visible */}
          <motion.li
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 + quote.breakdown.length * 0.04 }}
            className="border-b border-black/10 pb-3"
          >
            <div className="flex justify-between items-baseline gap-3">
              <span className="text-sm font-bold text-black flex items-center gap-2 flex-wrap">
                <span aria-hidden>🔍</span>
                <span>Análisis de sitio gratis</span>
                <span className="text-black/40 text-xs font-normal">
                  (EasyBits)
                </span>
              </span>
              <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                Incluido
              </span>
            </div>
            <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
              <li>Revisamos tu sitio antes de la llamada de 24h</li>
              <li>Llegamos con propuestas concretas, no preguntas genéricas</li>
              <li>
                {siteAnalysisCaptured
                  ? "✓ URL agregada — listo para tu llamada"
                  : "Agrega tu URL abajo para activarlo"}
              </li>
            </ul>
          </motion.li>

          {/* Add capabilities pills — only renders if there are unselected caps */}
          {canAdd && (
            <li className="pb-3 border-b border-black/10">
              <p className="text-xs text-black/55 mb-2 font-bold uppercase tracking-wider">
                + Agregar más capacidades
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableToAdd.map((c) => {
                  const hasTiers = c.tiers && c.tiers.length > 0;
                  const startPrice = hasTiers ? c.tiers![0].priceMxn : c.basePriceMxn;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onAddCapability!(c.id)}
                      className="text-xs px-2.5 py-1 rounded-full border border-black/30 text-black/70 hover:bg-black hover:text-white hover:border-black transition-colors flex items-center gap-1"
                    >
                      <span aria-hidden>{c.emoji}</span>
                      <span>{c.shortLabel}</span>
                      <span className="opacity-60 font-mono">
                        {startPrice === 0
                          ? "free"
                          : hasTiers
                            ? `desde $${startPrice.toLocaleString("en-US")}`
                            : `+$${startPrice.toLocaleString("en-US")}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          )}

          {/* Total mensual */}
          <motion.li
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: 0.15 + quote.breakdown.length * 0.04 + 0.1,
            }}
            className="pt-1 space-y-1.5"
          >
            <div className="flex justify-between items-baseline text-black/55">
              <span className="text-sm font-bold">
                Total mensual (lista)
              </span>
              <span className="font-mono font-bold text-sm tabular-nums line-through">
                {formatMxn(quote.monthlyTotalMxn)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-base font-black text-brand-500">
                Con {QUOTE_DISCOUNT_PCT}% off permanente
              </span>
              <span className="font-mono font-black text-lg tabular-nums text-brand-500">
                {formatMxn(discountedMonthly)}
              </span>
            </div>
            <p className="text-[10px] text-black/55 font-mono">
              Ahorras {formatMxn(monthlySaving)} cada mes al presentar tu
              cotización
            </p>
          </motion.li>
        </ul>

        <p className="mt-4 pt-3 border-t border-black/10 text-xs text-black/50">
          Precios en MXN, no incluyen IVA. Mensualidad recurrente, cancela
          cuando quieras (el setup nunca se reembolsa).
        </p>
      </div>

      {/* Custom integrations — info compacta, sin pricing aparte (todo entra en setup + discovery) */}
      {quote.hasCustomIntegrations && customIntegrationsDescription && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced ? { duration: 0 } : { delay: 0.6, duration: 0.4 }
          }
          className="mt-4 rounded-xl border-2 border-black bg-white p-4"
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <p className="text-[10px] uppercase tracking-widest font-black text-black/70 flex items-center gap-1.5">
              <span aria-hidden>🔌</span>
              Integraciones que mencionaste
            </p>
            {onRemoveCustomIntegrations && (
              <button
                type="button"
                onClick={onRemoveCustomIntegrations}
                aria-label="Quitar integraciones custom"
                title="Quitar integraciones custom"
                className="w-5 h-5 rounded-full bg-black/10 hover:bg-black hover:text-white text-black/60 text-[10px] font-black flex items-center justify-center transition-colors"
              >
                ×
              </button>
            )}
          </div>
          <p className="text-xs text-black/75">{customIntegrationsDescription}</p>
          <p className="text-[10px] text-black/50 mt-2 leading-snug">
            Las simples entran en el setup. Las complejas (SAP/ERP, sync
            continuo) las scopeamos en la primera reunión sin costo extra.
          </p>
        </motion.div>
      )}
    </div>
  );
};
