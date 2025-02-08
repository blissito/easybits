import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

export type Option = {
  label: string;
  value: string;
};
export const SelectInput = ({
  label,
  options = [],
  onChange,
  value,
  error,
  className,
  placeholder,
}: {
  className?: string;
  error?: ReactNode;
  value?: string;
  onChange?: (arg0: string) => void;
  label?: string;
  options?: Option[];
  placeholder?: string;
}) => {
  return (
    <label className="">
      <span className="mb-2 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        tabIndex={0}
        defaultValue=""
        className={cn(
          "w-max",
          "text-black",
          "border-2 border-black",
          "rounded-xl p-4 text-lg",
          "bg-white",
          "focus:outline-none focus:border-brand-500",
          className
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option, i) => (
          <option
            key={i}
            // selected={defaultSelected === option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      <div className="h-4"> {error && error}</div>
    </label>
  );
};
