import { motion, useReducedMotion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";
import type { Capability } from "~/lib/quiz/capabilities";
import { DEFAULT_TIER_ID } from "~/lib/quiz/capabilities";
import { formatMxn } from "~/lib/quiz/pricing";
import { ILLUSTRATION_BY_ID } from "~/components/quiz/illustrations/CapabilityIllustrations";
import { playYes, playNo } from "~/lib/quiz/sounds";

type CapabilityCardProps = {
  capability: Capability;
  // Llamado con tierId si selecciona, o null si decide no incluir.
  onAnswer: (tierId: string | null) => void;
};

export const CapabilityCard = ({
  capability,
  onAnswer,
}: CapabilityCardProps) => {
  const Illustration = ILLUSTRATION_BY_ID[capability.id];
  const reduced = useReducedMotion();
  const hasTiers = !!capability.tiers && capability.tiers.length > 0;

  return (
    <div className="flex flex-col items-center gap-6 md:gap-8 max-w-2xl mx-auto w-full">
      <motion.div
        initial={reduced ? false : { scale: 0.85, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 16 }
        }
        className={cn(
          "rounded-3xl border-[3px] border-black px-6 py-7 md:px-10 md:py-10 w-full",
          "shadow-[6px_6px_0_0_rgba(0,0,0,1)]",
          "min-h-[400px] md:min-h-[460px] flex flex-col",
          capability.bgClass
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6 mb-6">
          {Illustration ? (
            <div className="w-28 h-28 md:w-32 md:h-32 flex-shrink-0 mx-auto md:mx-0">
              <Illustration className="w-full h-full" />
            </div>
          ) : (
            <span className="text-5xl text-center md:text-left" aria-hidden>
              {capability.emoji}
            </span>
          )}
          <div className="text-center md:text-left">
            <span className="text-xs uppercase tracking-widest font-bold text-black/60">
              {capability.vendor}
              {capability.isAddon && (
                <span className="ml-2 px-2 py-0.5 bg-black text-white rounded-md text-[10px]">
                  add-on
                </span>
              )}
            </span>
            <h3 className="text-xl md:text-2xl font-black text-black leading-tight mt-1">
              {capability.label}
            </h3>
          </div>
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-black mb-3 leading-tight">
          {capability.question}
        </h2>
        <p className="text-base md:text-lg text-black/80 mb-2">
          {capability.description}
        </p>
        {!hasTiers && (
          <p className="text-sm font-mono text-black/60">
            {capability.basePriceMxn === 0
              ? "Incluido sin costo extra"
              : `+ ${formatMxn(capability.basePriceMxn)} / mes si lo incluyes`}
          </p>
        )}
      </motion.div>

      {/* Tiered: Básico / Pro stacked + skip */}
      {hasTiers ? (
        <div className="w-full max-w-xl flex flex-col gap-3">
          {capability.tiers!.map((tier, idx) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => {
                playYes();
                onAnswer(tier.id);
              }}
              className={cn(
                "rounded-2xl border-[3px] border-black px-5 py-4 text-left transition-all",
                "shadow-[4px_4px_0_0_rgba(0,0,0,1)]",
                "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)]",
                "active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_0_rgba(0,0,0,1)]",
                // Tier 0 = blanco (anchor), 1 = yellow (pro/recommended), 2 = pink (scale)
                idx === 0
                  ? "bg-white"
                  : idx === 1
                    ? "bg-brand-yellow"
                    : "bg-brand-pink"
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg md:text-xl font-black text-black">
                  {tier.label}
                </span>
                <span className="font-mono font-black text-base md:text-lg tabular-nums text-black">
                  {formatMxn(tier.priceMxn)} / mes
                </span>
              </div>
              <p className="text-xs md:text-sm text-black/70 mt-1 font-mono">
                {tier.cap.included} {tier.cap.unit}
              </p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              playNo();
              onAnswer(null);
            }}
            className="text-sm font-mono text-black/55 hover:text-black underline underline-offset-4 decoration-black/30 hover:decoration-black px-3 py-2 transition-colors self-center mt-1"
          >
            No incluir
          </button>
        </div>
      ) : capability.basePriceMxn === 0 ? (
        <div className="w-full max-w-md flex flex-col items-center gap-3">
          <BrutalButton
            onClick={() => {
              playYes();
              onAnswer(DEFAULT_TIER_ID);
            }}
            containerClassName="h-16 md:h-20 w-full"
            className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
          >
            Sí, incluir
          </BrutalButton>
          <button
            type="button"
            onClick={() => {
              playNo();
              onAnswer(null);
            }}
            className="text-sm font-mono text-black/55 hover:text-black underline underline-offset-4 decoration-black/30 hover:decoration-black px-3 py-1 transition-colors"
          >
            No incluir, saltar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-xl">
          <BrutalButton
            mode="ghost"
            onClick={() => {
              playNo();
              onAnswer(null);
            }}
            containerClassName="h-16 md:h-20 w-full"
            className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
          >
            No, gracias
          </BrutalButton>
          <BrutalButton
            onClick={() => {
              playYes();
              onAnswer(DEFAULT_TIER_ID);
            }}
            containerClassName="h-16 md:h-20 w-full"
            className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
          >
            Sí, incluir
          </BrutalButton>
        </div>
      )}
    </div>
  );
};
