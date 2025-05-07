import React from "react";
import { cn } from "~/utils/cn";

export type ButtonOption = {
  label?: React.ReactNode;
  [key: string]: any; // To allow custom props like `image`, `icon`, etc.
};

export type ButtonGroupProps = {
  options: ButtonOption[];
  onChange: (value: any) => void;
  className?: string;
  buttonClassName?: string;
  shadowClassName?: string;
  selectedButtonClassName?: string;
  selectedLabelClassName?: string;
  renderOption?: (option: ButtonOption, isSelected: boolean) => React.ReactNode;
};

const ButtonGroupInput = ({
  options = [],
  value,
  onChange,
  className = "",
  buttonClassName = "",
  shadowClassName = "",
  selectedButtonClassName = "",
  selectedLabelClassName = "",
  renderOption, // (option, isSelected) => JSX
}: ButtonGroupProps) => {
  const handleClick = (val) => {
    if (val !== value) {
      onChange?.(val);
    }
  };

  return (
    <div className={`flex gap-3 ${className}`}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <div
            className={cn(
              "group bg-black grow cursor-pointer relative block rounded-xl",
              shadowClassName,
              {
                "bg-brand-500 border border-black": isSelected,
                [selectedLabelClassName]: isSelected,
              }
            )}
          >
            <div
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={cn(
                "border border-black h-full relative rounded-xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all text-center",
                buttonClassName,
                {
                  "-translate-y-2 -translate-x-2 ": isSelected,
                  [selectedButtonClassName]: isSelected,
                }
              )}
            >
              {renderOption
                ? renderOption(option, isSelected)
                : option.label ?? option.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ButtonGroupInput;
