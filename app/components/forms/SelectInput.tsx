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
  name,
  error,
  className,
  placeholder,
  defaultValue,
}: {
  name: string;
  className?: string;
  error?: ReactNode;
  value?: string;
  onChange?: (arg0: string) => void;
  label?: string;
  options?: Option[];
  placeholder?: string;
  defaultValue?: string;
}) => {
  return (
    <label>
      <span className="mb-2 block">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        tabIndex={0}
        defaultValue={defaultValue}
        className={cn(
          "w-full",
          "text-black",
          "border border-black",
          "rounded-xl px-4 h-12 text-lg",
          "bg-white",
          "focus:outline-none focus:border-brand-500 focus:ring-transparent",
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
      <div className="min-h-4"> {error && error}</div>
    </label>
  );
};
