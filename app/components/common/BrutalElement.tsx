import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

interface BrutalButtonProps {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  [x: string]: unknown;
}

export const BrutalElement = ({
  children,
  className,
  containerClassName,
  ...props
}: BrutalButtonProps) => {
  return (
    <button
      className={cn("group rounded-xl bg-black", containerClassName)}
      {...props}
    >
      <span
        className={cn(
          "block", // así podemos usar translate
          "-translate-x-2 -translate-y-2   ",
          "rounded-xl overflow-hidden  border-black ",
          "hover:translate-x-0 hover:translate-y-0 transition-all",
          className
        )}
      >
        {children}
      </span>
    </button>
  );
};
