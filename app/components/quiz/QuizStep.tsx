import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "~/utils/cn";

type QuizStepProps = {
  stepKey: string | number;
  children: ReactNode;
  className?: string;
};

export const QuizStep = ({ stepKey, children, className }: QuizStepProps) => {
  return (
    <motion.div
      key={stepKey}
      initial={{ opacity: 0, x: 40, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -40, filter: "blur(6px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  );
};

type StepIndicatorProps = {
  current: number;
  total: number;
};

export const StepIndicator = ({ current, total }: StepIndicatorProps) => {
  const pct = Math.min(100, Math.max(0, (current / total) * 100));
  return (
    <div className="flex items-center gap-2 md:gap-3 min-w-0">
      <span className="text-xs md:text-sm font-mono text-black/60 whitespace-nowrap">
        {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      {/* Mobile: continuous progress bar — fits any total step count */}
      <div className="md:hidden h-1.5 w-24 bg-black/15 rounded-full overflow-hidden">
        <div
          className="h-full bg-black transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Desktop: discrete dashes per step */}
      <div className="hidden md:flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 w-6 rounded-full transition-colors",
              i < current ? "bg-black" : "bg-black/15"
            )}
          />
        ))}
      </div>
    </div>
  );
};
