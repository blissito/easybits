import { motion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { GENERATION_PACKS } from "~/lib/plans";
import {
  computePlanFromCredits,
  COST_DOC,
  COST_IMAGE,
  COST_REEL_AVATAR_30S,
  COST_REEL_HTML,
  COST_REEL_KLING,
  COST_SCRAPE_5_PAGES,
  COST_SEARCH,
  COST_VOICE_MINUTE,
  formatCredits,
  PLAN_CREDITS,
} from "~/lib/credits";
import { formatMxn } from "~/lib/quiz/pricing";

/**
 * Configuración de consumo mensual estimado del agente. Cada slider
 * representa una categoría de uso con costo distinto. El total de créditos
 * se computa con los COST_* del SoT (`app/lib/credits.ts`) y el plan +
 * precio se derivan de `computePlanFromCredits`.
 */
export type ConsumptionConfig = {
  /** Documentos PDF/DOCX/XLSX por mes. */
  docs: number;
  /** Imágenes generadas (Fal/OpenAI) por mes. */
  images: number;
  /** Reels HTML animados (Ghosty, cheap) por mes. */
  reelsHtml: number;
  /** Reels Kling text-to-video por mes. */
  reelsKling: number;
  /** Reels con avatar talking head (30s, fal.ai) por mes. */
  reelsAvatar: number;
  /** Minutos de voz clonada por mes. */
  voiceMinutes: number;
  /** Búsquedas web inteligentes (Brightdata SERP) por mes. */
  searches: number;
  /** Páginas web scrapeadas por mes. */
  scrapePages: number;
};

// Defaults pensados para que el usuario aterrice en "Plan Byte · Gratis"
// (suma ≤ freeUntil de la banda Byte). Total al default: 300 cr.
export const DEFAULT_CONSUMPTION: ConsumptionConfig = {
  docs: 3,
  images: 0,
  reelsHtml: 0,
  reelsKling: 0,
  reelsAvatar: 0,
  voiceMinutes: 0,
  searches: 0,
  scrapePages: 0,
};

type SliderConfig = {
  key: keyof ConsumptionConfig;
  emoji: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Calcula créditos consumidos para un valor del slider. */
  toCredits: (n: number) => number;
};

// Maxes calibrados para que la SUMA de los 8 sliders al tope ≈ 30,000 cr,
// el cap de la banda Tera. Los sliders nunca empujan al usuario a "exceder
// Tera" — recorren Byte → Mega → Tera de forma lineal.
//
// Costos por acción (CREDIT_SCALE=100):
//   1 doc           = 100 cr
//   1 imagen        =  50 cr
//   1 reel HTML     = 100 cr  (Ghosty, animado HTML)
//   1 reel Kling    = 400 cr  (text-to-video AI, ~5s)
//   1 reel avatar   = 600 cr  (talking head 30s, fal.ai)
//   1 min voz       = 800 cr  (ElevenLabs)
//   1 búsqueda web  = 200 cr  (Brightdata SERP)
//   5 pág scrape    = 100 cr  (= 20 cr/pág)
//
// Distribución del presupuesto Tera (30,000 cr):
//   docs       60 × 100 = 6,000 cr  (20%)
//   imágenes   80 ×  50 = 4,000 cr  (13%)
//   reels HTML 30 × 100 = 3,000 cr  (10%)
//   reels Kling 8 × 400 = 3,200 cr  (11%)
//   reels avt   4 × 600 = 2,400 cr  (8%)
//   voz min     4 × 800 = 3,200 cr  (11%)
//   búsquedas  20 × 200 = 4,000 cr  (13%)
//   scrape pág 200 × 20 = 4,000 cr  (13%)
//   total              = 29,800 cr  ≈ Tera cap
const SLIDERS: SliderConfig[] = [
  {
    key: "docs",
    emoji: "📄",
    label: "Documentos (PDF/DOCX/XLSX)",
    unit: "docs/mes",
    min: 0,
    max: 60,
    step: 1,
    toCredits: (n) => n * COST_DOC,
  },
  {
    key: "images",
    emoji: "🖼",
    label: "Imágenes generadas",
    unit: "imgs/mes",
    min: 0,
    max: 80,
    step: 1,
    toCredits: (n) => n * COST_IMAGE,
  },
  {
    key: "reelsHtml",
    emoji: "🎬",
    label: "Reels HTML (Ghosty)",
    unit: "reels/mes",
    min: 0,
    max: 30,
    step: 1,
    toCredits: (n) => n * COST_REEL_HTML,
  },
  {
    key: "reelsKling",
    emoji: "🎞",
    label: "Reels Kling (text-to-video)",
    unit: "reels/mes",
    min: 0,
    max: 8,
    step: 1,
    toCredits: (n) => n * COST_REEL_KLING,
  },
  {
    key: "reelsAvatar",
    emoji: "🗣",
    label: "Reels con avatar (talking head 30s)",
    unit: "reels/mes",
    min: 0,
    max: 4,
    step: 1,
    toCredits: (n) => n * COST_REEL_AVATAR_30S,
  },
  {
    key: "voiceMinutes",
    emoji: "🎙",
    label: "Voz clonada",
    unit: "min/mes",
    min: 0,
    max: 4,
    step: 1,
    toCredits: (n) => n * COST_VOICE_MINUTE,
  },
  {
    key: "searches",
    emoji: "🔍",
    label: "Búsquedas web",
    unit: "búsquedas/mes",
    min: 0,
    max: 20,
    step: 1,
    toCredits: (n) => n * COST_SEARCH,
  },
  {
    key: "scrapePages",
    emoji: "🔎",
    label: "Páginas web scrape",
    unit: "páginas/mes",
    min: 0,
    max: 200,
    step: 5,
    // 1 cr = 5 páginas → COST_SCRAPE_5_PAGES por cada 5
    toCredits: (n) => Math.ceil(n / 5) * COST_SCRAPE_5_PAGES,
  },
];

export const computeTotalCredits = (c: ConsumptionConfig): number =>
  // Fallback `?? 0` defensivo: si el state arrastra llaves viejas (HMR en
  // dev tras renombrar el tipo) algunas keys pueden venir undefined → NaN.
  SLIDERS.reduce((acc, s) => acc + s.toCredits(c[s.key] ?? 0), 0);

const cheapestPackPrice = Math.min(
  ...GENERATION_PACKS.map((p) => Math.min(...Object.values(p.prices)))
);

type ConfiguradorStepProps = {
  consumption: ConsumptionConfig;
  onChange: (next: ConsumptionConfig) => void;
  onContinue: () => void;
};

export const ConfiguradorStep = ({
  consumption,
  onChange,
  onContinue,
}: ConfiguradorStepProps) => {
  const totalCredits = computeTotalCredits(consumption);
  const quote = computePlanFromCredits(totalCredits);
  const teraCap = PLAN_CREDITS.Tera;
  const overflowAtPercent = Math.min(100, (totalCredits / teraCap) * 100);

  return (
    <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
      <motion.div
        initial={{ scale: 0.92, rotate: -2 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="rounded-3xl border-[3px] border-black px-6 py-8 md:px-10 md:py-10 w-full bg-white shadow-[6px_6px_0_0_rgba(0,0,0,1)] flex flex-col"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>🎚</span>
          <span className="text-xs uppercase tracking-widest font-bold text-black/60">
            Configurador de consumo
          </span>
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-black mb-3 leading-tight">
          ¿Cuánto va a usar tu agente al mes?
        </h2>
        <p className="text-base text-black/70 mb-6 leading-snug">
          Mueve los sliders al volumen que esperas y el plan se ajusta solo.
          No te encierras: si te quedas corto, recargas créditos desde{" "}
          {formatMxn(cheapestPackPrice)} MXN.
        </p>

        {/* Sliders */}
        <div className="flex flex-col gap-5 mb-6">
          {SLIDERS.map((s) => {
            const value = consumption[s.key] ?? 0;
            const credits = s.toCredits(value);
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <label
                    htmlFor={`slider-${s.key}`}
                    className="text-sm font-black text-black flex items-center gap-2"
                  >
                    <span aria-hidden>{s.emoji}</span>
                    <span>{s.label}</span>
                  </label>
                  <span className="text-[11px] font-mono text-black/55 tabular-nums">
                    {formatCredits(credits)} cr
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id={`slider-${s.key}`}
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={value}
                    onChange={(e) =>
                      onChange({
                        ...consumption,
                        [s.key]: Number(e.target.value),
                      })
                    }
                    className="flex-1 accent-brand-500 h-2"
                  />
                  <span className="text-sm font-mono text-black tabular-nums min-w-[80px] text-right">
                    {value} {s.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen del plan derivado */}
        <div className="rounded-2xl border-[3px] border-black bg-brand-yellow p-4 shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-black/55">
              Tu configuración
            </p>
            <p className="text-[11px] font-mono text-black/55 tabular-nums">
              {formatCredits(totalCredits)} cr/mes
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-xl md:text-2xl font-black text-black uppercase tracking-wide">
              Plan {quote.plan}
            </span>
            <span className="text-2xl md:text-3xl font-black text-black tabular-nums">
              {quote.isFree ? "Gratis" : `${formatMxn(quote.priceMxn)}/mes`}
            </span>
          </div>
          {/* Barra de progreso visual hacia el tope Tera */}
          <div className="mt-3 h-2 w-full bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-black transition-all duration-200"
              style={{ width: `${overflowAtPercent}%` }}
            />
          </div>
          {quote.overageCredits > 0 && (
            <p className="text-[11px] text-black/70 mt-2 font-mono leading-snug">
              ⚠ Excedes la banda Tera por{" "}
              <strong>{formatCredits(quote.overageCredits)} cr</strong>. Esos
              créditos se cobran en packs (desde {formatMxn(cheapestPackPrice)}
              {" "}MXN).
            </p>
          )}
        </div>

        <p className="text-xs text-black/50 mt-4">
          El precio se ajusta en vivo conforme mueves los sliders. Decides
          mensual vs anual al final, antes de pagar.
        </p>
      </motion.div>

      <BrutalButton
        onClick={onContinue}
        containerClassName="h-16 md:h-20"
        className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
      >
        Continuar →
      </BrutalButton>
    </div>
  );
};
