import type { ReactNode } from "react";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

interface BrutalButtonProps {
  id?: string;
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  isDisabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  mode?: "ghost" | "brand" | "danger" | "landing" | "inverted";
  type?: "button" | "submit";
  style?: React.CSSProperties;
  [x: string]: unknown;
}

export const BrutalButton = ({
  id,
  mode = "brand",
  children,
  onClick,
  className,
  containerClassName,
  isLoading,
  isDisabled,
  type = "button",
  style,
  ...props
}: BrutalButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className={cn("group rounded-xl h-12 bg-black", containerClassName, {
        "bg-black/70": isDisabled || isLoading,
        "w-full": mode === "landing",
      })}
      type={type}
      {...props}
    >
      <span
        id={id}
        className={cn(
          "w-max",
          "min-w-32 h-12 px-4",
          "grid place-content-center",
          "block", // así podemos usar translate
          "text-lg font-semibold",
          "rounded-xl border-[2px] border-black bg-brand-500",
          "transition-all ",
          className,
          {
            "bg-white": mode === "ghost",
            "bg-red-400/90": mode === "danger",
            "bg-gray-300 text-gray-400 cursor-not-allowed border-gray-400":
              isDisabled || isLoading,
            "active:te-x-0 active:translate-y-0": !isDisabled && !isLoading,
            "hover:-translate-x-1 hover:-translate-y-1":
              !isDisabled && !isLoading,
            "w-full rounded-none border-b-2 border-x-0  hover:-translate-x-0 hover:-translate-y-0":
              mode === "landing", // se usa para el checkout
            "-translate-x-1 -translate-y-1 hover:-translate-x-0 hover:-translate-y-0":
              mode === "inverted",
          }
        )}
        style={style}
      >
        {isLoading ? <Spinner /> : children}
      </span>
    </button>
  );
};
