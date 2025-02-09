import { useState, type ReactNode } from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa";
import { cn } from "~/utils/cn";
import { motion } from "motion/react";

interface InputProps {
  bgColor?: string;
  children?: ReactNode;
  onClick?: () => void;
  error?: string;
  label?: string;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  copy?: string;
  value?: string;
  [x: string]: unknown;
}

export const Input = ({ label, error, copy, ...props }: InputProps) => {
  return (
    <label className="grid gap-2 text-white">
      <span>{label}</span>
      <div className="relative">
        <input
          className={cn(
            "rounded-xl p-4 text-lg min-w-full md:w-96 mb-6 border h-[54px] bg-white text-black",
            {
              "pr-24": !!copy,
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
  const [timeout, set] = useState<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      disabled={!!timeout}
      onClick={() => {
        timeout && clearTimeout(timeout);
        navigator.clipboard.writeText(text); // 🪄✨🤩
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
