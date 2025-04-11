import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa";
import { cn } from "~/utils/cn";
import { motion } from "motion/react";

interface InputProps {
  type?: "textarea";
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
  className?: string;
  inputClassName?: string;
  isError?: boolean;
  defaultValue?: string | null;
  onChange?: (ev: ChangeEvent<HTMLInputElement>) => void;
  [x: string]: unknown;
}

export const Input = ({
  className,
  defaultValue,
  label,
  error,
  type,
  copy,
  inputClassName,
  isError,
  onChange,
  ...props
}: InputProps) => {
  // const ref = useRef<HTMLInputElement>(null);

  // useEffect(() => {
  //   ref.current?.focus();
  // }, [isError]);

  const ElementName = type === "textarea" ? "textarea" : "input";

  return (
    <label
      className={cn(
        "w-full",
        "flex flex-col gap-2 text-gray text-white",
        className,
        {
          // "h-[50%]": type === "textarea",
          "h-[600px]": type === "textarea",
        }
      )}
    >
      {label && <span>{label}</span>}
      <div className="relative flex-1">
        <ElementName
          onChange={onChange}
          defaultValue={defaultValue}
          className={cn(
            "rounded-xl p-4 text-lg h-12 w-full placeholder:text-tale border border-black  bg-white text-black",
            "focus:border-brand-500 focus:outline-none focus:ring-brand-500",
            {
              "pr-24": !!copy,
              "ring-2 ring-red-500 transition-all border-none": isError,
            },
            inputClassName
          )}
          {...props}
        />
        {copy && <CopyMagnetButton text={copy} />}
      </div>
      {error && <p>{error}</p>}
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
