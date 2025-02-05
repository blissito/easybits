import { useState, type ReactNode } from "react";
import { FaCopy } from "react-icons/fa";
import { useTimeout } from "~/hooks/useTimeout";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

interface ButtonProps {
  bgColor?: string;
  children?: ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  size: string;
}

export const Button = ({
  isLoading,
  bgColor,
  children,
  onClick,
  size = "default",
  ...props
}: ButtonProps) => {
  return (
    <div className="relative group inline-block">
      {/* Shadow button */}
      <div className="absolute inset-0 bg-black rounded-lg transition-transform duration-300 scale-100 group-hover:translate-x-2 group-hover:translate-y-2 opacity-0 group-hover:opacity-100" />
      <button
        className={cn(
          "rounded-xl flex gap-2 items-center justify-center p-4 text-black text-lg w-full border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1",
          bgColor || "bg-white",

          size === "large" && "md:w-[420px] h-[54px]",
          size === "default" && "w-[183px] h-[65px]"
        )}
        onClick={onClick}
        {...props}
      >
        {isLoading ? <Spinner /> : children}
      </button>
    </div>
  );
};
