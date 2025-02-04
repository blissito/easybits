import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

interface BrutalButtonProps {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  [x: string]: unknown;
}

export const BrutalButton = ({
  children,
  className,
  containerClassName,
  ...props
}: BrutalButtonProps) => {
  return (
    <button
      className={cn("group rounded-md bg-black", containerClassName)}
      {...props}
    >
      <span
        className={cn(
          "block", // así podemos usar translate
          "-translate-x-2 -translate-y-2  p-4 text-2xl  hover:-translate-y-3",
          "rounded-md border-2 border-black bg-yellow-500",
          "active:translate-x-0 active:translate-y-0 transition-all",
          className
        )}
      >
        {children}
      </span>
    </button>
  );
};
