import { useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import { motion } from "motion/react";

export const Switch = ({
  onChange,
  value,
  defaultChecked,
  label,
  holderClassName,
  className,
}: {
  value?: boolean;
  className?: string;
  defaultChecked?: boolean;
  onChange?: (arg0: boolean) => void;
  label?: string;
  holderClassName?: string;
}) => {
  const [checked, setChecked] = useState(defaultChecked);
  const handleChange = () => {
    const c = !checked;
    setChecked(c);
    onChange?.(c);
  };

  useEffect(() => {
    if (value !== undefined) {
      setChecked(value || false);
    }
  }, [value]);

  return (
    <button
      className={cn("text-left flex gap-4 h-6", className)}
      type="button"
      onClick={handleChange}
    >
      <div
        className={cn(
          "p-[3px] w-11 border-black rounded-full border flex items-center bg-gray-200",
          holderClassName,
          {
            "justify-end bg-brand-500": checked,
          }
        )}
      >
        <motion.div
          layout
          className="border-black bg-white rounded-full w-4 h-4 border transition-all"
        />
      </div>
      <span>{label}</span>
      <input
        checked={checked}
        className="checkbox hidden"
        onChange={() => {}} // for linter only
      />
    </button>
  );
};
