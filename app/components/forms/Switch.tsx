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
      className={cn("text-left flex gap-3 h-6 min-w-0 ", className)}
      type="button"
      onClick={handleChange}
    >
      <motion.div
        animate={{ backgroundColor: checked ? "#9870ED" : "#e5e7eb" }}
        transition={{ duration: 0.2 }}
        className={cn(
          "p-[3px] w-11 shrink-0 border-black rounded-full border flex items-center",
          holderClassName,
          { "justify-end": checked }
        )}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="border-black bg-white rounded-full w-4 h-4 border"
        />
      </motion.div>
      {label && <span className="truncate">{label}</span>}
      <input
        checked={checked}
        className="checkbox hidden"
        onChange={() => {}} // for linter only
      />
    </button>
  );
};
