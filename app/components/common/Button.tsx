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
}

export const Button = ({
  isLoading,
  bgColor,
  children,
  onClick,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn(
        "rounded-xl flex gap-2 items-center justify-center p-4 text-black text-lg w-full md:w-96 hover:shadow-xl cursor-pointer",
        bgColor || "bg-white"
      )}
      onClick={onClick}
      {...props}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
};
