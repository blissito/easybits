import { useState, type ReactNode } from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa";
import { cn } from "~/utils/cn";
import { motion } from "motion/react";

interface ButtonProps {
  bgColor?: string;
  children?: ReactNode;
  onClick?: () => void;
  error?: string;
  label?: string;
  copy?: boolean;
}

export const Input = ({ label, error, copy, ...props }: ButtonProps) => {
  return (
    <label className="grid gap-2">
      <span>{label}</span>
      <div className="relative">
        <input
          className={cn(
            "rounded-xl p-4 text-lg min-w-full md:w-96 mb-6 border",
            {
              "pr-24": copy,
            }
          )}
          {...props}
        />
        {copy && <CopyMagnetButton text={copy} />}
      </div>
      <p>{error}</p>
    </label>
  );
};

/** Needs a relative parent */
const CopyMagnetButton = ({ text }: { text: string }) => {
  const [timeout, set] = useState<ReturnType<typeof setTimeout> | null>();
  return (
    <button
      disabled={timeout}
      onClick={() => {
        timeout && clearTimeout(timeout);
        navigator.clipboard.writeText(text);
        set(setTimeout(() => set(null), 2000));
      }}
      className="absolute right-px top-px bg-gray-700 p-auto w-24 h-[60px] rounded-r-xl grid place-content-center text-xl"
    >
      <motion.span
        key={timeout}
        initial={{ filter: "blur(4px)" }}
        animate={{ filter: "blur(0px)" }}
      >
        {timeout ? <FaCheck /> : <FaRegCopy />}
      </motion.span>
    </button>
  );
};
