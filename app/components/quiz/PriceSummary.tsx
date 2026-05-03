import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Quote } from "~/lib/quiz/pricing";
import {
  ANNUAL_DISCOUNT_PCT,
  BABYSIT_MONTHLY_MXN,
  computeAnnualFromMonthly,
  formatMxn,
  SETUP_FLAT_MXN,
} from "~/lib/quiz/pricing";
import type { Capability } from "~/lib/quiz/capabilities";
import { GENERATION_PACKS, PLANS, type PlanKey } from "~/lib/plans";

export type PlanBilling = "monthly" | "annual";

type PriceSummaryProps = {
  quote: Quote;
  selectedPlan: PlanKey;
  onSelectPlan: (plan: PlanKey) => void;
  planBilling: PlanBilling;
  onPlanBillingChange: (mode: PlanBilling) => void;
  babysitOpt: boolean;
  onBabysitToggle: (next: boolean) => void;
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

const PLAN_ORDER: PlanKey[] = ["Byte", "Mega", "Tera"];

const PLAN_BLURB: Record<PlanKey, string> = {
  Byte: "Para probar el agente",
  Mega: "Para uso profesional regular",
  Tera: "Para alto volumen y equipos",
};

export const PriceSummary = ({
  quote,
  selectedPlan,
  onSelectPlan,
  planBilling,
  onPlanBillingChange,
  babysitOpt,
  onBabysitToggle,
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
  const reduced = useReducedMotion();
  const removable = !!onRemoveCapability;
  const canAdd = !!onAddCapability && availableToAdd.length > 0;
  const planSupportsAnnual = selectedPlan !== "Byte";
  const effectiveBilling: PlanBilling =
    planSupportsAnnual && planBilling === "annual" ? "annual" : "monthly";

  const [isCapsOpen, setIsCapsOpen] = useState(quote.selectionsCount <= 3);

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-5">
        <p className="text-sm uppercase tracking-widest font-bold text-black/60">
          Tu agente custom
        </p>
      </div>

      {/* Bloque 1 — Setup único FIJO */}
      <div className="rounded-2xl border-[3px] border-black bg-black text-white p-5 md:p-6 shadow-[5px_5px_0_0_rgba(0,0,0,1)] mb-5">
        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-brand-yellow">
          Setup único · pago una sola vez
        </p>
        <p className="text-4xl md:text-5xl font-black tabular-nums leading-tight mt-1">
          {formatMxn(SETUP_FLAT_MXN)}
        </p>
        <p className="text-xs text-white/70 font-mono mt-1">
          MXN · setup técnico + personalización total
        </p>
        <p className="text-[10px] text-brand-yellow font-bold mt-2">
          ✓ Hablamos por WhatsApp antes de cobrar
        </p>

        {/* Acordeones de qué incluye */}
        <div className="mt-4 space-y-2">
          <details className="rounded-xl bg-white/5 border border-white/10 p-3 group">
            <summary className="cursor-pointer text-xs font-bold text-white list-none flex items-center justify-between gap-2">
              <span>¿Qué incluye el setup técnico?</span>
              <span className="text-white/50 group-open:rotate-90 transition-transform">
                ▸
              </span>
            </summary>
            <ul className="mt-2 text-xs text-white/80 space-y-1 list-disc list-inside leading-relaxed">
              <li>Configuración del agente: modelos (Claude/Gemini), prompts base y guardrails</li>
              <li>MCPs conectados — acceso a tus DBs, archivos, APIs y herramientas</li>
              <li>2 integraciones simples (CRM, forms, webhooks tipo HubSpot/Mercado Libre)</li>
              <li>Hosting + infraestructura — corre 24/7, escala solo</li>
            </ul>
          </details>
          <details className="rounded-xl bg-white/5 border border-white/10 p-3 group">
            <summary className="cursor-pointer text-xs font-bold text-white list-none flex items-center justify-between gap-2">
              <span>¿Qué incluye la personalización?</span>
              <span className="text-white/50 group-open:rotate-90 transition-transform">
                ▸
              </span>
            </summary>
            <ul className="mt-2 text-xs text-white/80 space-y-1 list-disc list-inside leading-relaxed">
              <li>Tu marca: logo, colores, voz, tono — el agente habla como tú</li>
              <li>Prompts custom para tu vertical y casos de uso del quiz</li>
              <li>Capacidades armadas: las que seleccionaste quedan listas para usar</li>
              <li>30 días pair WhatsApp con dos seniors — ajustes ilimitados durante el arranque</li>
              <li>Onboarding con tu equipo (1-2 sesiones de handoff)</li>
            </ul>
          </details>
        </div>
      </div>

      {/* Bloque 2 — Plan de créditos */}
      <div className="rounded-2xl border-[3px] border-black bg-yellow-100 shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-5 mb-5">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <p className="text-sm font-black text-black uppercase tracking-widest">
            🪙 Plan de créditos
          </p>
          <p className="text-[10px] text-black/55 font-mono">
            cancelas cuando quieras
          </p>
        </div>
        <p className="text-base text-black font-bold mb-3 leading-snug">
          1 crédito = 1 documento profesional
        </p>
        <p className="text-[11px] text-black/60 font-mono mb-4">
          (6 cr = 1 reel avatar · 8 cr = 1 min voz clonada · 1 cr = 5 páginas scrapeadas)
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isSelected = selectedPlan === key;
            const isAnnualView =
              isSelected && key !== "Byte" && effectiveBilling === "annual";
            const annualPrice = computeAnnualFromMonthly(plan.price);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPlan(key)}
                aria-pressed={isSelected}
                className={`text-left rounded-xl border-[3px] border-black px-3 py-3 transition-all ${
                  isSelected
                    ? "bg-white shadow-[3px_3px_0_0_rgba(0,0,0,1)] -translate-x-0.5 -translate-y-0.5"
                    : "bg-white/50 hover:bg-white/80"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] font-black text-black/70">
                  {plan.name}
                </p>
                <p className="text-2xl font-black text-black tabular-nums leading-tight mt-0.5">
                  {plan.aiGenerationsPerMonth ?? "∞"}{" "}
                  <span className="text-xs font-mono text-black/55">
                    cr/mes
                  </span>
                </p>
                <p className="text-[11px] font-mono text-black/65 mt-1">
                  {plan.price === 0
                    ? "Gratis"
                    : isAnnualView
                      ? `${formatMxn(annualPrice)}/año`
                      : `${formatMxn(plan.price)}/mes`}
                </p>
                <p className="text-[10px] text-black/50 mt-1.5 leading-snug">
                  {PLAN_BLURB[key]}
                </p>
                {isSelected && (
                  <span className="inline-block mt-2 text-[9px] font-black uppercase tracking-wider bg-black text-white px-1.5 py-0.5 rounded">
                    ✓ seleccionado
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Switch mensual/anual sólo para Mega y Tera */}
        {planSupportsAnnual && (
          <div className="flex items-center gap-2 mb-1">
            <div className="inline-flex rounded-full border-2 border-black bg-white p-0.5">
              <button
                type="button"
                onClick={() => onPlanBillingChange("monthly")}
                aria-pressed={effectiveBilling === "monthly"}
                className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition ${
                  effectiveBilling === "monthly"
                    ? "bg-black text-white"
                    : "text-black/60 hover:text-black"
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => onPlanBillingChange("annual")}
                aria-pressed={effectiveBilling === "annual"}
                className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition ${
                  effectiveBilling === "annual"
                    ? "bg-black text-white"
                    : "text-black/60 hover:text-black"
                }`}
              >
                Anual
              </button>
            </div>
            <p className="text-[11px] font-mono text-black/65">
              Anual: {ANNUAL_DISCOUNT_PCT}% off (≈ 2 meses gratis)
            </p>
          </div>
        )}
      </div>

      {/* Bloque 3 — Babysit opcional */}
      <button
        type="button"
        onClick={() => onBabysitToggle(!babysitOpt)}
        aria-pressed={babysitOpt}
        className={`w-full text-left rounded-2xl border-[3px] border-black p-4 mb-5 transition-all shadow-[3px_3px_0_0_rgba(0,0,0,1)] ${
          babysitOpt
            ? "bg-brand-yellow -translate-x-0.5 -translate-y-0.5"
            : "bg-white hover:bg-white/90"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-6 h-6 shrink-0 rounded-md border-[2.5px] border-black flex items-center justify-center text-sm font-black ${
              babysitOpt ? "bg-black text-brand-yellow" : "bg-white text-transparent"
            }`}
          >
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-sm font-black uppercase tracking-widest text-black">
                Babysit del agente · opcional
              </p>
              <p className="text-sm font-mono font-black text-black tabular-nums">
                +{formatMxn(BABYSIT_MONTHLY_MXN)}/mes
              </p>
            </div>
            <p className="text-xs text-black/70 mt-1 leading-relaxed">
              Humano que vigila el agente, ajusta prompts cuando algo no jala y
              te responde por WhatsApp. Soporte real, no chatbot.
            </p>
          </div>
        </div>
      </button>

      {/* Bloque 4 — Recargas (packs) inline */}
      <div className="rounded-2xl border-[3px] border-black bg-white shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-5 mb-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className="text-sm font-black text-black uppercase tracking-widest">
            ⚡ Recargas — compra créditos extra
          </p>
        </div>
        <p className="text-[11px] text-black/60 mb-3">
          Si te quedas sin créditos del mes, recarga sin esperar al ciclo. No
          caducan mientras esté activo tu plan.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {GENERATION_PACKS.slice(0, 4).map((pack) => {
            const price = pack.prices[selectedPlan];
            return (
              <div
                key={pack.id}
                className={`rounded-xl border-2 p-2.5 text-center ${
                  pack.featured
                    ? "border-black bg-brand-yellow"
                    : "border-black/30 bg-white"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider font-black text-black/70">
                  {pack.generations} cr
                </p>
                <p className="text-lg font-black text-black tabular-nums mt-0.5">
                  {formatMxn(price)}
                </p>
                {pack.featured && (
                  <p className="text-[9px] font-black uppercase tracking-wider mt-0.5">
                    ★ popular
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Packs temáticos como pills */}
        {GENERATION_PACKS.length > 4 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider font-black text-black/55 mb-1.5">
              Packs por uso típico
            </p>
            <div className="flex flex-wrap gap-1.5">
              {GENERATION_PACKS.slice(4).map((pack) => {
                const price = pack.prices[selectedPlan];
                return (
                  <span
                    key={pack.id}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-black/30 bg-white text-black/80"
                    title={pack.description}
                  >
                    <span aria-hidden>{pack.emoji}</span>
                    <span className="font-bold">{pack.label}</span>
                    <span className="font-mono text-black/55">
                      {pack.generations} cr · {formatMxn(price)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bloque 5 — Lo que tu agente hace (capabilities sin precios) */}
      <div className="rounded-2xl border-[3px] border-black bg-white shadow-[4px_4px_0_0_rgba(0,0,0,1)] overflow-hidden mb-5">
        <button
          type="button"
          onClick={() => setIsCapsOpen((v) => !v)}
          aria-expanded={isCapsOpen}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-black/[0.03] transition-colors"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm uppercase tracking-widest font-bold text-black">
              Lo que tu agente hace
              {removable && (
                <span className="ml-2 text-[10px] font-normal text-black/45 normal-case tracking-normal">
                  · puedes editar
                </span>
              )}
            </span>
            <span className="text-xs text-black/55 font-mono tabular-nums truncate">
              {quote.selectionsCount}{" "}
              {quote.selectionsCount === 1 ? "capacidad" : "capacidades"} ·
              listo desde el setup
            </span>
          </div>
          <span
            className={`text-black/50 text-xl font-black transition-transform shrink-0 ${
              isCapsOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ▸
          </span>
        </button>
        <AnimatePresence initial={false}>
          {isCapsOpen && (
            <motion.div
              key="caps-body"
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
              }
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-1 border-t border-black/10">
                <ul className="flex flex-col gap-3">
                  {quote.breakdown.map((line, i) => (
                    <motion.li
                      key={line.capability.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: 0.05 + i * 0.04 }}
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
                        {removable && (
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveCapability!(line.capability.id)
                            }
                            aria-label={`Quitar ${line.capability.shortLabel}`}
                            title={`Quitar ${line.capability.shortLabel}`}
                            className="w-5 h-5 rounded-full bg-black/10 hover:bg-black hover:text-white text-black/60 text-xs font-black flex items-center justify-center transition-colors shrink-0"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <ul className="mt-1.5 text-xs text-black/60 list-disc list-inside space-y-0.5">
                        {line.capability.includes.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </motion.li>
                  ))}

                  {/* Análisis de sitio gratis */}
                  <motion.li
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.08 + quote.breakdown.length * 0.04,
                    }}
                    className="border-b border-black/10 pb-3"
                  >
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-sm font-bold text-black flex items-center gap-2 flex-wrap">
                        <span aria-hidden>🔍</span>
                        <span>Análisis de sitio gratis</span>
                      </span>
                      <span className="text-[10px] uppercase font-black text-brand-500">
                        Incluido
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-black/60">
                      {siteAnalysisCaptured
                        ? "✓ URL agregada — listo para tu llamada"
                        : "Revisamos tu sitio antes de la llamada de 24h"}
                    </p>
                  </motion.li>

                  {canAdd && (
                    <li className="pt-1">
                      <p className="text-xs text-black/55 mb-2 font-bold uppercase tracking-wider">
                        + Agregar más capacidades
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableToAdd.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onAddCapability!(c.id)}
                            className="text-xs px-2.5 py-1 rounded-full border border-black/30 text-black/70 hover:bg-black hover:text-white hover:border-black transition-colors flex items-center gap-1"
                          >
                            <span aria-hidden>{c.emoji}</span>
                            <span>{c.shortLabel}</span>
                          </button>
                        ))}
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Integraciones custom (sin cambios) */}
      {quote.hasCustomIntegrations && customIntegrationsDescription && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced ? { duration: 0 } : { delay: 0.3, duration: 0.4 }
          }
          className="rounded-xl border-2 border-black bg-white p-4 mb-5"
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

      {/* Botón pequeño de PDF (en lugar de la card grande) */}
      {onDownloadPdf && (
        <div className="text-center">
          <button
            onClick={onDownloadPdf}
            disabled={disableDownload || isDownloadingPdf}
            className="inline-flex items-center gap-2 text-xs text-black/65 hover:text-black underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
          >
            {isDownloadingPdf ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-black/60 border-t-transparent rounded-full animate-spin" />
                <span>Generando cotización…</span>
              </>
            ) : (
              "↓ Descargar cotización (PDF)"
            )}
          </button>
        </div>
      )}
    </div>
  );
};
