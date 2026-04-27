import { motion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";
import type { Capability } from "~/lib/quiz/capabilities";
import { formatMxn } from "~/lib/quiz/pricing";

type CapabilityCardProps = {
  capability: Capability;
  onAnswer: (include: boolean) => void;
};

export const CapabilityCard = ({
  capability,
  onAnswer,
}: CapabilityCardProps) => {
  return (
    <div className="flex flex-col items-center gap-8 max-w-2xl mx-auto">
      <motion.div
        initial={{ scale: 0.85, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className={cn(
          "rounded-3xl border-[3px] border-black px-10 py-12 w-full",
          "shadow-[6px_6px_0_0_rgba(0,0,0,1)]",
          capability.bgClass
        )}
      >
        <div className="flex items-center gap-4 mb-6">
          <span className="text-5xl" aria-hidden>
            {capability.emoji}
          </span>
          <div>
            <span className="text-xs uppercase tracking-widest font-bold text-black/60">
              {capability.vendor}
              {capability.isAddon && (
                <span className="ml-2 px-2 py-0.5 bg-black text-white rounded-md text-[10px]">
                  add-on
                </span>
              )}
            </span>
            <h3 className="text-2xl md:text-3xl font-black text-black leading-tight">
              {capability.label}
            </h3>
          </div>
        </div>

        <h2 className="text-3xl md:text-4xl font-black text-black mb-4 leading-tight">
          {capability.question}
        </h2>
        <p className="text-base md:text-lg text-black/80 mb-2">
          {capability.description}
        </p>
        <p className="text-sm font-mono text-black/60">
          + {formatMxn(capability.basePriceMxn)} / mes si lo incluyes
        </p>
      </motion.div>

      <div className="flex gap-4 w-full justify-center">
        <BrutalButton mode="ghost" onClick={() => onAnswer(false)}>
          No, gracias
        </BrutalButton>
        <BrutalButton onClick={() => onAnswer(true)}>
          Sí, incluir
        </BrutalButton>
      </div>
    </div>
  );
};
