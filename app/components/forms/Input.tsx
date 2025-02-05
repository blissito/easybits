import type { ReactNode } from "react";

export const Input = ({
  label,
  error,
  ...props
}: {
  error?: string;
  label?: ReactNode;
  [x: string]: unknown;
}) => {
  return (
    <label className="grid">
      <div className="mb-2 font-medium">{label}</div>
      <input
        {...props}
        className="border rounded-2xl border-black px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
      />
      <p className="text-xs text-red-500 h-4">{error}</p>
    </label>
  );
};
