import { type ReactNode } from "react";
import { cn } from "~/utils/cn";
import { Copy } from "../common/Copy";

export const Input = ({
  label,
  error,
  type = "text",
  copyText,
  ...props
}: {
  onChange?: () => void;
  copyText?: string;
  type?: "number" | "text";
  error?: string;
  label?: ReactNode;
  [x: string]: unknown;
}) => {
  return (
    <label className="relative">
      <div className="mb-2 font-medium">{label}</div>
      <input
        {...props}
        type={type}
        className={cn(
          "border-2 rounded-xl border-black px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all",
          "h-16 w-full",
          {
            "w-20": type === "number",
          }
        )}
      />
      <div className="text-xs text-red-500 h-4">{error}</div>
      {!!copyText && <Copy text={copyText} />}
    </label>
  );
};
