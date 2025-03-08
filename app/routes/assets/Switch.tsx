import { useState } from "react";
import { cn } from "~/utils/cn";
import { motion } from "motion/react";

export const Switch = ({
  onChange,
  defaultChecked = true,
  label,
  className,
}: {
  className?: string;
  defaultChecked?: boolean;
  onChange?: (arg0: boolean) => void;
  label?: string;
}) => {
  const [checked, setChecked] = useState(defaultChecked);
  const handleChange = () => {
    const c = !checked;
    setChecked(c);
    onChange?.(c);
  };
  return (
    <button
      className={cn("text-left flex gap-4", className)}
      type="button"
      onClick={handleChange}
    >
      <div
        className={cn(
          "p-[3px] w-11 border-black rounded-full border flex items-center bg-gray-200",
          {
            "justify-end bg-brand-500": checked,
          }
        )}
      >
        <motion.div
          transition={{ duration: 0.25 }}
          layout
          className="border-black bg-white rounded-full w-4 h-4 border"
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
