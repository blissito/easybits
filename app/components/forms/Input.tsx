import { type ReactNode } from "react";
import { cn } from "~/utils/cn";
import { Copy } from "../common/Copy";

export const Input = ({
  label,
  error,
  type = "text",
  copyText,
  className,
  prefix,
  sufix,
  ...props
}: {
  onChange?: React.InputHTMLAttributes<HTMLInputElement>['onChange'];
  copyText?: string;
  type?: "number" | "text";
  error?: string;
  label?: ReactNode;
  className?: string;
  prefix?: ReactNode;
  sufix?: ReactNode;
  [x: string]: unknown;
}) => {
  return (
    <label className="relative">
      {label ? <div className="mb-2 font-medium">{label}</div> : null}
      <div className="relative">
        {prefix && (
          <div className="absolute inset-0 left-0 top-0 px-1 py-2 z-10 h-full w-[50px] flex items-center justify-center">
            {prefix}
          </div>
        )}
        {sufix && (
          <div className="absolute inset-0 right-0 px-2 py-3">{sufix}</div>
        )}
        <input
          {...props}
          type={type}
          className={cn(
            "border rounded-xl border-black px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all",
            "h-12 w-full",
            {
              "w-28": type === "number",
              "pl-12": prefix,
              "pr-8": sufix,
            },
            className
          )}
        />
      </div>

      <div className="text-xs text-red-500 h-4">{error}</div>
      {!!copyText && <Copy text={copyText} />}
    </label>
  );
};
