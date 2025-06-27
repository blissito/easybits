import { type ReactNode } from "react";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

interface ButtonProps {
  id?: string;
  children?: ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  mode?: "primary" | "default" | "large";
  type?: "button" | "submit";
  isDisabled?: boolean;
  className?: string;
  [x: string]: unknown;
}

export const Button = ({
  id,
  isLoading,
  children,
  onClick,
  isDisabled,
  className,
  type = "button",
  mode = "default",
  ...props
}: ButtonProps) => {
  return (
    <div className="relative group inline-block">
      {/* Shadow button */}
      <div
        className={cn(
          "absolute inset-0 w-full bg-black rounded-xl duration-300",
          isDisabled
            ? "opacity-0"
            : "group-hover:translate-x-1 group-hover:translate-y-1 group-hover:opacity-100"
        )}
      />
      <button
        id={id}
        disabled={isDisabled}
        type={type}
        className={cn(
          "rounded-xl flex gap-2 items-center justify-center text-black text-lg w-full border-black border-2 relative duration-300 h-12 min-w-[28]",
          "bg-white",
          "px-8 py-3 ",
          {
            "w-full h-12": mode === "large",
            "px-4": mode === "default",
            "bg-brand-500 h-12 px-4": mode === "primary",
            "opacity-50 cursor-not-allowed !bg-gray-400 border-gray-300 text-gray-500":
              isDisabled,
            "cursor-pointer group-hover:-translate-x-1 group-hover:-translate-y-1":
              !isDisabled,
          },
          className
        )}
        onClick={onClick}
        {...props}
      >
        {isLoading ? <Spinner /> : children}
      </button>
    </div>
  );
};
