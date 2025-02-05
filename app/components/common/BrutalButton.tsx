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
      className={cn("group rounded-md bg-black", containerClassName, {
        "bg-black/70": isDisabled || isLoading,
      })}
      {...props}
    >
      <span
        className={cn(
          "min-w-[180px] min-h-14",
          "grid place-content-center",
          "block", // así podemos usar translate
          "-translate-x-2 -translate-y-2  p-4 text-2xl hover:-translate-y-3",
          "rounded-md border-2 border-black bg-yellow-500",
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
