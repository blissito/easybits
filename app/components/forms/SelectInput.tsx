import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

export type Option = {
  label: string;
  value: string;
};
export const SelectInput = ({
  label,
  options,
  onChange,
  value,
  error,
}: {
  error?: ReactNode;
  value?: string;
  onChange?: (arg0: string) => void;
  label?: string;
  options: Option[];
}) => {
  return (
    <label>
      <span className="mb-2 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        tabIndex={0}
        defaultValue=""
        className={cn(
          "border-2 border-black",
          "min-w-full md:w-96",
          "rounded-xl p-4 text-lg h-[54px]",
          "bg-white text-black",
          "focus:outline-none focus:border-brand-500"
        )}
      >
        <option value="" disabled>
          Selecciona una opción
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
      <div className="h-4 mb-6"> {error && error}</div>
    </label>
  );
};
