import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import type { Quote } from "~/lib/quiz/pricing";
import {
  ANNUAL_DISCOUNT_PCT,
  computeAnnualFromMonthly,
  computeSetupEffective,
  CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN,
  formatMxn,
  SETUP_BASE_MXN,
} from "~/lib/quiz/pricing";
import type { Capability } from "~/lib/quiz/capabilities";
import { formatCredits } from "~/lib/credits";
import { GENERATION_PACKS, PLANS, type PlanKey } from "~/lib/plans";

// Precio del pack más barato (cualquier plan) — para la leyenda mínima
// "recargas desde $X" en el summary.
const CHEAPEST_PACK_MXN = Math.min(
  ...GENERATION_PACKS.map((p) => Math.min(...Object.values(p.prices)))
);

// Color de fondo por plan en la card del summary. Cada plan tiene su
// identidad visual: Byte azul (gratis/arranque), Mega amarillo (sweet spot),
// Tera rosa (premium). NOTA: el fondo de la página es brand-grass, por eso
// Byte no usa ese tono — quedaría camuflado.
const PLAN_BG: Record<PlanKey, string> = {
  Byte: "bg-linen",
  Mega: "bg-brand-yellow",
  Tera: "bg-brand-pink",
};

// Icono SVG por plan — los mismos que se usan en /planes (Pricing.tsx) para
// consistencia visual entre cotizador y página pública de planes.
const PLAN_ICON: Record<PlanKey, string> = {
  Byte: "/home/foco.svg",
  Mega: "/home/rocket.svg",
  Tera: "/home/coder.svg",
};

export type PlanBilling = "monthly" | "annual";

type PriceSummaryProps = {
  quote: Quote;
  selectedPlan: PlanKey;
  /** Precio mensual MXN del plan, derivado del configurador (sliders). */
  planMonthlyMxn: number;
  /** Total cr/mes que cubre el plan según el configurador. */
  planCreditsPerMonth: number;
  /** Créditos overflow (cuando excede la banda Tera). 0 si no aplica. */
  planOverageCredits?: number;
  planBilling: PlanBilling;
  onPlanBillingChange: (mode: PlanBilling) => void;
  /** Trigger para volver al configurador (sliders). */
  onChangePlan?: () => void;
  // CTA de pago — se rendea dentro de la plan card. Si no se pasa, no se
  // muestra el botón (la página externa puede tener su propio CTA).
  onCheckout?: () => void;
  isCheckoutLoading?: boolean;
  isCheckoutDisabled?: boolean;
  availableToAdd?: Capability[];
  onAddCapability?: (capId: string) => void;
  onRemoveCapability?: (capId: string) => void;
};

export const PriceSummary = ({
  quote,
  selectedPlan,
  planMonthlyMxn,
  planCreditsPerMonth,
  planOverageCredits = 0,
  planBilling,
  onPlanBillingChange,
  onChangePlan,
  onCheckout,
  isCheckoutLoading = false,
  isCheckoutDisabled = false,
  availableToAdd = [],
  onAddCapability,
  onRemoveCapability,
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

      {/* Bloque 1 — Setup único. Recalcula en vivo: $39K base + suma de las
          capabilities seleccionadas + $10K si trae integraciones custom.
          Babysit del agente viene incluido (no es line item aparte). */}
      {(() => {
        const setupEff = computeSetupEffective(
          quote.capsTotalMxn,
          quote.hasCustomIntegrations
        );
        const hasCaps = quote.capsTotalMxn > 0;
        return (
          <div className="rounded-2xl border-[3px] border-black bg-black text-white p-5 md:p-6 shadow-[5px_5px_0_0_rgba(0,0,0,1)] mb-5">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-brand-yellow">
              Setup único · pago una sola vez
            </p>
            <p className="text-4xl md:text-5xl font-black tabular-nums leading-tight mt-1">
              {formatMxn(setupEff)}
            </p>
            {(hasCaps || quote.hasCustomIntegrations) && (
              <p className="text-[11px] font-mono text-white/55 mt-1">
                {formatMxn(SETUP_BASE_MXN)} base
                {hasCaps && ` + ${formatMxn(quote.capsTotalMxn)} capacidades`}
                {quote.hasCustomIntegrations &&
                  ` + ${formatMxn(CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN)} integraciones custom`}
              </p>
            )}

            <p className="text-base md:text-lg font-black text-white mt-4 leading-snug">
              Tu agente nace con tu marca, tu voz y tu manera.
            </p>
            <p className="text-sm text-white/75 mt-2 leading-relaxed">
              Dos expertos en robots lo arman pieza por pieza: modelo, prompts, MCPs,
              integraciones y branding. Babysit del agente, 30 días acompañándote por
              WhatsApp y onboarding con tu equipo — todo incluido. Cuando
              arranca, ya queda funcionando y listo para producción.
            </p>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-white/60">
              <span>✓ Modelos Claude/Gemini</span>
              <span>✓ MCPs conectados</span>
              <span>✓ Prompts a tu vertical</span>
              <span>✓ Tu logo, colores, tono</span>
              <span>✓ 2 integraciones simples</span>
              <span>✓ Hosting 24/7</span>
            </div>

            <p className="text-[11px] text-brand-yellow font-bold mt-4">
              ✓ Hablamos por WhatsApp antes de cobrar — si no encajamos, no hay deal
            </p>
          </div>
        );
      })()}

      {/* Bloque 2 — Plan derivado del configurador. El precio es continuo
          (no fijo por plan), depende de los sliders del paso anterior.
          "ajustar consumo" regresa al configurador. */}
      {(() => {
        const plan = PLANS[selectedPlan];
        const isFree = planMonthlyMxn === 0;
        const annualTotal = isFree ? 0 : computeAnnualFromMonthly(planMonthlyMxn);
        const showingAnnual =
          planSupportsAnnual && effectiveBilling === "annual" && !isFree;
        return (
          <div className={`rounded-2xl border-[3px] border-black ${PLAN_BG[selectedPlan]} shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-5 mb-5`}>
            {/* "ajustar consumo" como link tiny arriba a la derecha */}
            {onChangePlan && (
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={onChangePlan}
                  className="text-[11px] font-mono text-black/55 hover:text-black underline underline-offset-2"
                >
                  ajustar consumo
                </button>
              </div>
            )}

            {/* Header principal — icono + nombre del plan a la izquierda
                aprovechando el espacio, precio grande a la derecha. */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={PLAN_ICON[selectedPlan]}
                  alt={`Icono plan ${plan.name}`}
                  className="w-12 h-12 md:w-14 md:h-14 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-black/55 leading-none">
                    Tu plan
                  </p>
                  <p className="text-2xl md:text-3xl font-black text-black uppercase tracking-wide leading-tight mt-1">
                    {plan.name}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="block text-2xl md:text-3xl font-black text-black tabular-nums leading-tight">
                  {isFree
                    ? "Gratis"
                    : showingAnnual
                      ? `${formatMxn(annualTotal)}/año`
                      : `${formatMxn(planMonthlyMxn)}/mes`}
                </span>
                {/* Sub-línea siempre presente cuando el plan es pago — para
                    que el toggle Mensual/Anual no empuje la card. Mensual la
                    rendea invisible (reserva espacio); anual la rendea con
                    el equivalente mensual. */}
                {!isFree && (
                  <span
                    className={`block text-[11px] font-mono mt-0.5 ${
                      showingAnnual ? "text-black/55" : "invisible"
                    }`}
                    aria-hidden={!showingAnnual}
                  >
                    ≈ {formatMxn(Math.round(annualTotal / 12))}/mes
                  </span>
                )}
              </div>
            </div>

            {/* Toggle Mensual/Anual — solo vista del pago, no cambia plan */}
            {planSupportsAnnual && (
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-black/10">
                <p className="text-[10px] font-mono text-black/55 uppercase tracking-wider">
                  Vista del pago
                </p>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-full border-2 border-black bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => onPlanBillingChange("monthly")}
                      aria-pressed={effectiveBilling === "monthly"}
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full transition ${
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
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full transition ${
                        effectiveBilling === "annual"
                          ? "bg-black text-white"
                          : "text-black/60 hover:text-black"
                      }`}
                    >
                      Anual
                    </button>
                  </div>
                  <p className="text-[10px] font-mono text-black/65">
                    {ANNUAL_DISCOUNT_PCT}% off
                  </p>
                </div>
              </div>
            )}

            {/* CTA primario dentro de la plan card — el momento de
                commitment está aquí, no abajo. */}
            {onCheckout && (
              <div className="mt-4 pt-4 border-t-2 border-black/15">
                <BrutalButton
                  onClick={onCheckout}
                  isLoading={isCheckoutLoading}
                  isDisabled={isCheckoutDisabled}
                  containerClassName="h-16 md:h-20 w-full"
                  className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
                >
                  Pagar personalización y arrancar →
                </BrutalButton>
              </div>
            )}
          </div>
        );
      })()}

      {/* Bloque 3 — Leyenda mínima de recargas. Antes era un acordeón con 3
          packs adentro; el feedback fue que distraía del flow de cotización.
          Ahora es una sola línea sutil. Tu plan ya cubre el consumo
          configurado; las recargas son escape hatch si te quedas corto. */}
      <p className="text-center text-[11px] text-black/55 leading-snug mb-5">
        ¿Te quedas corto un mes? Recargas créditos desde{" "}
        <strong className="text-black/80">{formatMxn(CHEAPEST_PACK_MXN)} MXN</strong>{" "}
        · sin caducidad
        {planOverageCredits > 0 && (
          <>
            {" "}· tu consumo configurado excede Tera por{" "}
            <strong className="text-black/80">
              {formatCredits(planOverageCredits)} cr
            </strong>
          </>
        )}
        .
      </p>

      {/* Bloque 4 — Lo que tu agente hace (capabilities sin precios) */}
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
              isCapsOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            ▾
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

                  {/* Análisis de sitio gratis y la línea de integraciones
                      custom se removieron del breakdown — el primero se
                      moverá a otra parte de la página y las integraciones
                      ahora se reflejan en el setup (+$10K), no como cap. */}

                  {canAdd && (() => {
                    const addable = availableToAdd.filter((c) => !c.comingSoon);
                    const soonable = availableToAdd.filter((c) => c.comingSoon);
                    return (
                      <li className="pt-1">
                        {addable.length > 0 && (
                          <>
                            <p className="text-xs text-black/55 mb-2 font-bold uppercase tracking-wider">
                              + Agregar más capacidades
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {addable.map((c) => (
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
                          </>
                        )}
                        {soonable.length > 0 && (
                          <>
                            <p className="text-xs text-black/45 mb-2 font-bold uppercase tracking-wider">
                              próximamente
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {soonable.map((c) => (
                                <span
                                  key={c.id}
                                  title={`${c.label} — próximamente`}
                                  aria-disabled="true"
                                  className="text-xs px-2.5 py-1 rounded-full border border-dashed border-black/20 text-black/40 cursor-not-allowed flex items-center gap-1 select-none"
                                >
                                  <span aria-hidden>{c.emoji}</span>
                                  <span>{c.shortLabel}</span>
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })()}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Integraciones custom y PDF download viven ahora en otros lugares:
          integraciones como line item del breakdown, PDF en el footer de
          acciones del route. */}
    </div>
  );
};
