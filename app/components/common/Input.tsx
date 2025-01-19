import { useState, type ReactNode } from "react";
import { FaCopy } from "react-icons/fa";
import { useTimeout } from "~/hooks/useTimeout";
import { cn } from "~/utils/cn";

interface ButtonProps {
  bgColor?: string;
  children?: ReactNode;
  onClick?: () => void;
}

export const Input = ({ label, ...props }: ButtonProps) => {
  return (
    <div className="flex flex-col gap-2">
      <label>{label}</label>
      <input
        className="rounded-xl p-4 text-black text-lg w-full md:w-96 bg-white mb-6"
        {...props}
      />
    </div>
  );
};
