import { type ReactNode } from "react";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  mode?: "primary" | "default" | "large";
  type?: "button" | "submit";
  isDisabled?: boolean;
}

export const Button = ({
  isLoading,
  children,
  onClick,
  isDisabled,
  type = "button",
  mode = "default",
  ...props
}: ButtonProps) => {
  return (
    <div className="relative group inline-block">
      {/* Shadow button */}
      <div className="absolute inset-0 bg-black rounded-xl duration-300  group-hover:translate-x-1 group-hover:translate-y-1 group-hover:opacity-100" />
      <button
        disabled={isDisabled}
        type={type}
        className={cn(
          "rounded-xl flex gap-2 items-center justify-center text-black text-lg w-full border-black border-2 cursor-pointer relative duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1",
          "bg-white",
          "px-8 py-3",
          mode === "large" && "md:w-[420px] h-[54px]",
          {
            "px-8 py-3": mode === "default",
            "bg-brand-500": mode === "primary",
          }
        )}
        onClick={onClick}
        {...props}
      >
        {isLoading ? <Spinner /> : children}
      </button>
    </div>
  );
};
