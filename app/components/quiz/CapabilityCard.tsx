import { motion, useReducedMotion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";
import type { Capability } from "~/lib/quiz/capabilities";
import { formatMxn } from "~/lib/quiz/pricing";
import { ILLUSTRATION_BY_ID } from "~/components/quiz/illustrations/CapabilityIllustrations";

type CapabilityCardProps = {
  capability: Capability;
  onAnswer: (include: boolean) => void;
};

export const CapabilityCard = ({
  capability,
  onAnswer,
}: CapabilityCardProps) => {
  const Illustration = ILLUSTRATION_BY_ID[capability.id];
  const reduced = useReducedMotion();

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
        <p className="text-sm font-mono text-black/60">
          + {formatMxn(capability.basePriceMxn)} / mes si lo incluyes
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-xl">
        <BrutalButton
          mode="ghost"
          onClick={() => onAnswer(false)}
          containerClassName="h-16 md:h-20 w-full"
          className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
        >
          No, gracias
        </BrutalButton>
        <BrutalButton
          onClick={() => onAnswer(true)}
          containerClassName="h-16 md:h-20 w-full"
          className="h-16 md:h-20 w-full px-4 md:px-8 text-xl md:text-2xl"
        >
          Sí, incluir
        </BrutalButton>
      </div>
    </div>
  );
};
