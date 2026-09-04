import { motion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { effectivePrice, GENERATION_PACKS, WEB_PACKS } from "~/lib/plans";
import {
  computePlanFromCredits,
  COST_DOC,
  COST_IMAGE,
  COST_REEL_AVATAR_30S,
  COST_REEL_HTML,
  COST_REEL_KLING,
  COST_VOICE_MINUTE,
  formatCredits,
  PLAN_CREDITS,
} from "~/lib/credits";
import { formatMxn } from "~/lib/quiz/pricing";
import { cheapestPacks, WEB_FREE_QUERIES } from "~/lib/calculadora";
import type { PlanKey } from "~/lib/plans";

// Color de fondo del card-resumen según la banda activa (mismo mapa que
// PriceSummary). Sin esto el card se queda fijo en amarillo aunque el plan
// cambie a Byte o Tera.
const PLAN_BG: Record<PlanKey, string> = {
  Byte: "bg-blue-200",
  Mega: "bg-brand-yellow",
  Tera: "bg-brand-pink",
};

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
  /** Consultas web al mes (buscar, leer, extraer). NO son créditos: van por
   *  packs Web (`WEB_PACKS`) y se suman aparte del plan. */
  webQueries: number;
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
  webQueries: 0,
};

// URL: sólo las llaves que difieren del default, "docs:40,webQueries:3000".
export const serializeConsumption = (c: ConsumptionConfig): string =>
  (Object.keys(DEFAULT_CONSUMPTION) as (keyof ConsumptionConfig)[])
    .filter((k) => (c[k] ?? 0) !== DEFAULT_CONSUMPTION[k])
    .map((k) => `${k}:${c[k]}`)
    .join(",");

export const parseConsumption = (str: string): ConsumptionConfig => {
  const out = { ...DEFAULT_CONSUMPTION };
  for (const part of str.split(",")) {
    const [k, v] = part.split(":");
    const n = Number(v);
    if (k in DEFAULT_CONSUMPTION && Number.isFinite(n) && n >= 0) out[k as keyof ConsumptionConfig] = n;
  }
  return out;
};

/** Costo mensual en packs Web para N consultas (las primeras 50 son gratis). */
export const webMonthlyMxn = (queries: number): number =>
  cheapestPacks(
    Math.max(0, queries - WEB_FREE_QUERIES),
    WEB_PACKS.map((p) => ({ id: p.id, units: p.queries, price: p.price })),
  ).mxn;

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

// Maxes = cap individual de Tera (50,000 cr) por categoría, asumiendo que
// el usuario destina TODO su presupuesto a un solo slider. El slider mapea
// no-linealmente al rango: 0–33% = banda Byte, 33–66% = Mega, 66–100% = Tera.
// Ver `sliderToCount` / `countToSlider` en `lib/quiz/scale.ts`.
//
// Costos por acción (CREDIT_SCALE=100):
//   1 doc           = 100 cr  →  Tera solo-docs    =   500/mes
//   1 imagen        =  50 cr  →  Tera solo-imgs    = 1,000/mes
//   1 reel HTML     = 100 cr  →  Tera solo-reels   =   500/mes  (Ghosty)
//   1 reel Kling    = 400 cr  →  Tera solo-Kling   =   125/mes  (text-to-video)
//   1 reel avatar   = 600 cr  →  Tera solo-avatar  =    83/mes  (talking head 30s)
//   1 min voz       = 800 cr  →  Tera solo-voz     =    62/mes  (ElevenLabs)
// Las consultas web NO son créditos: tienen su slider aparte (packs Web).
const SLIDERS: SliderConfig[] = [
  {
    key: "docs",
    emoji: "📄",
    label: "Documentos (PDF/DOCX/XLSX)",
    unit: "docs/mes",
    min: 0,
    max: 500,
    step: 1,
    toCredits: (n) => n * COST_DOC,
  },
  {
    key: "images",
    emoji: "🖼",
    label: "Imágenes generadas",
    unit: "imgs/mes",
    min: 0,
    max: 1000,
    step: 1,
    toCredits: (n) => n * COST_IMAGE,
  },
  {
    key: "reelsHtml",
    emoji: "🎬",
    label: "Reels HTML (Ghosty)",
    unit: "reels/mes",
    min: 0,
    max: 500,
    step: 1,
    toCredits: (n) => n * COST_REEL_HTML,
  },
  {
    key: "reelsKling",
    emoji: "🎞",
    label: "Reels Kling (text-to-video)",
    unit: "reels/mes",
    min: 0,
    max: 125,
    step: 1,
    toCredits: (n) => n * COST_REEL_KLING,
  },
  {
    key: "reelsAvatar",
    emoji: "🗣",
    label: "Reels con avatar (talking head 30s)",
    unit: "reels/mes",
    min: 0,
    max: 83,
    step: 1,
    toCredits: (n) => n * COST_REEL_AVATAR_30S,
  },
  {
    key: "voiceMinutes",
    emoji: "🎙",
    label: "Voz clonada",
    unit: "min/mes",
    min: 0,
    max: 62,
    step: 1,
    toCredits: (n) => n * COST_VOICE_MINUTE,
  },
];

export const computeTotalCredits = (c: ConsumptionConfig): number =>
  // Fallback `?? 0` defensivo: si el state arrastra llaves viejas (HMR en
  // dev tras renombrar el tipo) algunas keys pueden venir undefined → NaN.
  SLIDERS.reduce((acc, s) => acc + s.toCredits(c[s.key] ?? 0), 0);

const WEB_MAX = 50_000;
const WEB_STEP = 50;

// ──────────────────────────────────────────────────────────────────
// Escala no-lineal por slider (Byte / Mega / Tera = 33% / 33% / 34%
// del recorrido visual). Sin esto el thumb cruza a Tera con muy poco
// arrastre porque Byte (999 cr) es ~2% del cap Tera (50,000 cr).
// ──────────────────────────────────────────────────────────────────

type BandCounts = { byte: number; mega: number; tera: number };

const getBandCounts = (s: SliderConfig): BandCounts => {
  const crPerUnit = s.toCredits(s.step) / s.step;
  const floorToStep = (n: number) =>
    Math.max(0, Math.floor(n / s.step) * s.step);
  return {
    byte: Math.min(s.max, floorToStep(PLAN_CREDITS.Byte / crPerUnit)),
    mega: Math.min(s.max, floorToStep(PLAN_CREDITS.Mega / crPerUnit)),
    tera: s.max,
  };
};

const countToSlider = (count: number, b: BandCounts): number => {
  if (count <= 0) return 0;
  if (count <= b.byte) return b.byte === 0 ? 0 : (count / b.byte) * 33;
  if (count <= b.mega) {
    if (b.mega === b.byte) return 33;
    return 33 + ((count - b.byte) / (b.mega - b.byte)) * 33;
  }
  if (b.tera === b.mega) return 100;
  return Math.min(
    100,
    66 + ((count - b.mega) / (b.tera - b.mega)) * 34
  );
};

const sliderToCount = (
  pct: number,
  b: BandCounts,
  step: number
): number => {
  let raw: number;
  if (pct <= 33) {
    raw = b.byte === 0 ? 0 : (pct / 33) * b.byte;
  } else if (pct <= 66) {
    raw = b.byte + ((pct - 33) / 33) * (b.mega - b.byte);
  } else {
    raw = b.mega + ((pct - 66) / 34) * (b.tera - b.mega);
  }
  return Math.round(raw / step) * step;
};

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
  // Precio PLANO del plan sugerido — es lo que cobra el checkout. Las bandas
  // interpoladas de computePlanFromCredits sólo eligen el plan.
  const planMonthly = effectivePrice(quote.plan);
  const web = consumption.webQueries ?? 0;
  const webMxn = webMonthlyMxn(web);
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
          Mueve los sliders al volumen que esperas y el plan se elige solo.
          No te encierras: si te quedas corto, recargas con packs desde{" "}
          {formatMxn(cheapestPackPrice)} MXN, y no caducan.
        </p>

        {/* Sliders */}
        <div className="flex flex-col gap-5 mb-6">
          {SLIDERS.map((s) => {
            const value = consumption[s.key] ?? 0;
            const credits = s.toCredits(value);
            const bands = getBandCounts(s);
            const sliderPct = countToSlider(value, bands);
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
                  <div className="relative flex-1 h-4 flex items-center">
                    {/* Zonas Byte/Mega/Tera pintadas en el track */}
                    <div
                      className="absolute left-0 right-0 h-2 rounded-full pointer-events-none border border-black/15"
                      style={{
                        background:
                          "linear-gradient(to right," +
                          " rgb(191 219 254) 0%, rgb(191 219 254) 33%," +
                          " rgb(253 230 138) 33%, rgb(253 230 138) 66%," +
                          " rgb(251 207 232) 66%, rgb(251 207 232) 100%)",
                      }}
                    />
                    <input
                      id={`slider-${s.key}`}
                      type="range"
                      min={0}
                      max={100}
                      step={0.1}
                      value={sliderPct}
                      onChange={(e) =>
                        onChange({
                          ...consumption,
                          [s.key]: sliderToCount(
                            Number(e.target.value),
                            bands,
                            s.step
                          ),
                        })
                      }
                      className="relative z-10 w-full h-4 appearance-none bg-transparent cursor-pointer
                        [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black
                        [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                        [&::-webkit-slider-thumb]:shadow-md
                        [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent
                        [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-black [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                        [&::-moz-range-thumb]:shadow-md"
                    />
                  </div>
                  <span className="text-sm font-mono text-black tabular-nums min-w-[80px] text-right">
                    {value} {s.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Consultas web — aparte de los créditos, se compran por pack */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor="slider-web" className="text-sm font-black text-black flex items-center gap-2">
              <span aria-hidden>🌐</span>
              <span>Consultas web (buscar, leer, extraer)</span>
            </label>
            <span className="text-[11px] font-mono text-black/55 tabular-nums">
              {webMxn === 0 ? `${WEB_FREE_QUERIES} gratis` : `${formatMxn(webMxn)}/mes en packs`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="slider-web"
              type="range"
              min={0}
              max={WEB_MAX}
              step={WEB_STEP}
              value={web}
              onChange={(e) => onChange({ ...consumption, webQueries: Number(e.target.value) })}
              className="w-full h-2 accent-black cursor-pointer"
            />
            <span className="text-sm font-mono text-black tabular-nums min-w-[80px] text-right">
              {web.toLocaleString("es-MX")} /mes
            </span>
          </div>
        </div>

        {/* Resumen del plan derivado */}
        <div
          className={`rounded-2xl border-[3px] border-black p-4 shadow-[3px_3px_0_0_rgba(0,0,0,1)] transition-colors duration-300 ${PLAN_BG[quote.plan]}`}
        >
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
              {planMonthly === 0 ? "Gratis" : `${formatMxn(planMonthly)}/mes`}
            </span>
          </div>
          {/* Barra de progreso visual hacia el tope Tera */}
          <div className="mt-3 h-2 w-full bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-black transition-all duration-200"
              style={{ width: `${overflowAtPercent}%` }}
            />
          </div>
          {webMxn > 0 && (
            <p className="text-[11px] text-black/70 mt-2 font-mono leading-snug">
              + {formatMxn(webMxn)}/mes en packs Web ({web.toLocaleString("es-MX")} consultas).
            </p>
          )}
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
          El plan se elige en vivo conforme mueves los sliders; el precio es el
          de lista del plan. Decides mensual vs anual al final, antes de pagar.
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
