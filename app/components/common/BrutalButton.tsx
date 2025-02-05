import type { ReactNode } from "react";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

interface BrutalButtonProps {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  isDisabled?: boolean;
  isLoading?: boolean;
  [x: string]: unknown;
}

export const BrutalButton = ({
  children,
  className,
  containerClassName,
  isLoading,
  isDisabled,
  ...props
}: BrutalButtonProps) => {
  return (
    <button
      disabled={isDisabled || isLoading}
      className={cn("group rounded-2xl bg-black", containerClassName, {
        "bg-black/70": isDisabled || isLoading,
      })}
      {...props}
    >
      <span
        className={cn(
          "min-w-[180px] min-h-12",
          "grid place-content-center",
          "block", // así podemos usar translate
          "hover:-translate-x-1 hover:-translate-y-1 p-4 text-lg font-semibold",
          "rounded-2xl border-2 border-black bg-brand-500",
          "transition-all",
          className,
          {
            "bg-brand-500/70": isDisabled || isLoading,
            "active:translate-x-0 active:translate-y-0 ":
              !isDisabled && !isLoading,
          }
        )}
      >
        {isLoading ? <Spinner /> : children}
      </span>
    </button>
  );
};
