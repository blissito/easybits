import { useState, type ReactNode } from "react";
import { FaCopy } from "react-icons/fa";
import { useTimeout } from "~/hooks/useTimeout";
import { cn } from "~/utils/cn";

interface ButtonProps {
  bgColor?: string;
  children?: ReactNode;
  onClick?: () => void;
}

export const Button = ({ bgColor, children, onClick }: ButtonProps) => {
  return (
    <button
      className={cn(
        "rounded-xl flex gap-2 items-center justify-center p-4 text-black text-lg w-full md:w-96 hover:shadow-xl",
        bgColor || "bg-white"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
