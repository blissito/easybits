import { motion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { GENERATION_PACKS, PLANS, effectivePrice, hasPromo, type PlanKey } from "~/lib/plans";
import {
  COST_DOC,
  COST_REEL_30S,
  COST_SCRAPE_5_PAGES,
  COST_VOICE_MINUTE,
  formatCredits,
} from "~/lib/credits";
import {
  computeAnnualFromMonthly,
  formatMxn,
} from "~/lib/quiz/pricing";

type PlanStepProps = {
  selectedPlan: PlanKey;
  onSelect: (plan: PlanKey) => void;
  onContinue: () => void;
};

const PLAN_ORDER: PlanKey[] = ["Byte", "Mega", "Tera"];

const PLAN_HINT: Record<PlanKey, string> = {
  Byte: "Para probar el agente — créditos justos para arrancar",
  Mega: "Para uso profesional regular — ritmo de equipo PyME",
  Tera: "Para alto volumen y equipos — ritmo de agencia o ecommerce",
};

// Mismos iconos que se usan en /planes (Pricing.tsx) para consistencia.
const PLAN_ICON: Record<PlanKey, string> = {
  Byte: "/home/foco.svg",
  Mega: "/home/rocket.svg",
  Tera: "/home/coder.svg",
};

// Equivalencias concretas para ayudar a aterrizar qué tantos créditos son.
// Calculado con tarifas reales: 1 cr = 1 doc · 6 cr = 1 reel avatar (30s) ·
// 8 cr = 1 min voz clonada · 1 cr = 5 páginas scrapeadas.
const PLAN_EXAMPLES: Record<PlanKey, string> = {
  Byte: "≈ 9 docs/mes · o 1 reel avatar + 3 docs",
  Mega: "≈ 50 docs/mes · u 8 reels + 2 docs · o 6 min de voz clonada",
  Tera: "≈ 200 docs/mes · 1 reel diario + 30 docs · o 25 min de voz clonada",
};

const cheapestPackPrice = Math.min(
  ...GENERATION_PACKS.map((p) => Math.min(...Object.values(p.prices)))
);

export const PlanStep = ({
  selectedPlan,
  onSelect,
  onContinue,
}: PlanStepProps) => {
  return (
    <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
      <motion.div
        initial={{ scale: 0.92, rotate: -2 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="rounded-3xl border-[3px] border-black px-6 py-8 md:px-10 md:py-10 w-full bg-white shadow-[6px_6px_0_0_rgba(0,0,0,1)] flex flex-col"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>🪙</span>
          <span className="text-xs uppercase tracking-widest font-bold text-black/60">
            Plan de créditos
          </span>
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-black mb-3 leading-tight">
          ¿Cuántos créditos al mes va a consumir tu agente?
        </h2>
        <ul className="text-base md:text-lg text-black/80 mb-3 list-disc list-inside space-y-1.5 leading-snug">
          <li>
            <strong>{formatCredits(COST_DOC)} créditos</strong> = 1 documento profesional con tu marca
            <span className="block ml-6 text-sm text-black/55 font-mono">≈ 5 páginas, lista para mandar</span>
          </li>
          <li>
            <strong>{formatCredits(COST_REEL_30S)} créditos</strong> = 1 reel con avatar y voz
            <span className="block ml-6 text-sm text-black/55 font-mono">30 segundos · vertical 9:16 para reels/shorts</span>
          </li>
          <li>
            <strong>{formatCredits(COST_VOICE_MINUTE)} créditos</strong> = 1 minuto de voz clonada
            <span className="block ml-6 text-sm text-black/55 font-mono">≈ 800 caracteres · 1 audio largo de WhatsApp</span>
          </li>
          <li>
            <strong>{formatCredits(COST_SCRAPE_5_PAGES)} créditos</strong> = 5 páginas web scrapeadas
            <span className="block ml-6 text-sm text-black/55 font-mono">para investigación de competencia o catálogo</span>
          </li>
        </ul>
        <p className="text-sm text-black/60 mb-6">
          Si te quedas sin créditos del mes, recargas desde {formatMxn(cheapestPackPrice)} MXN — los packs no caducan.
        </p>

        <div className="flex flex-col gap-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isSelected = selectedPlan === key;
            const isFree = plan.price === 0;
            const monthly = isFree ? 0 : effectivePrice(key);
            const promo = hasPromo(key);
            const annualPrice = isFree ? 0 : computeAnnualFromMonthly(monthly);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                aria-pressed={isSelected}
                className={`text-left rounded-2xl border-[3px] border-black px-5 py-4 transition-all ${
                  isSelected
                    ? "bg-brand-yellow shadow-[3px_3px_0_0_rgba(0,0,0,1)] -translate-x-0.5 -translate-y-0.5"
                    : "bg-white hover:bg-black/5"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <img
                      src={PLAN_ICON[key]}
                      alt={`Icono plan ${plan.name}`}
                      className="w-7 h-7 shrink-0"
                    />
                    <span className="text-base md:text-lg font-black text-black uppercase tracking-wider">
                      {plan.name}
                    </span>
                    <span className="text-2xl md:text-3xl font-black text-black tabular-nums leading-none">
                      {plan.aiGenerationsPerMonth ? formatCredits(plan.aiGenerationsPerMonth) : "∞"}
                    </span>
                    <span className="text-xs font-mono text-black/55">
                      cr/mes
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl md:text-2xl font-black text-black tabular-nums">
                      {isFree ? (
                        "Gratis"
                      ) : (
                        <>
                          {promo && (
                            <span className="text-black/40 font-bold line-through mr-1.5">
                              {formatMxn(plan.price)}
                            </span>
                          )}
                          {`${formatMxn(monthly)}/mes`}
                        </>
                      )}
                    </span>
                    {!isFree && (
                      <span className="block text-[11px] font-mono text-black/50 mt-0.5">
                        ≈ {formatMxn(annualPrice)} si pagas anual
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs md:text-sm text-black/65 mt-2 leading-snug">
                  {PLAN_HINT[key]}
                </p>
                <p className="text-[11px] font-mono text-black/50 mt-1 leading-snug">
                  {PLAN_EXAMPLES[key]}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-black/50 mt-6">
          Decides mensual vs anual al final, antes de pagar. Cancelas cuando
          quieras.
        </p>
      </motion.div>

      <BrutalButton onClick={onContinue}>
        Continuar →
      </BrutalButton>
    </div>
  );
};
