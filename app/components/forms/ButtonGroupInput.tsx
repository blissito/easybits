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
  selectedShadowClassName?: string;
  renderOption?: (option: ButtonOption, isSelected: boolean) => React.ReactNode;
  value?: string;
};

const ButtonGroupInput = ({
  options = [],
  value,
  onChange,
  className = "",
  buttonClassName = "",
  shadowClassName = "",
  selectedButtonClassName = "",
  selectedShadowClassName = "",
  renderOption, // (option, isSelected) => JSX
}: ButtonGroupProps) => {
  const handleClick = (val) => {
    if (val !== value) {
      onChange?.(val);
    }
  };

  return (
    <div className={`flex gap-4 ${className}`}>
      {options.map((option, key) => {
        const isSelected = option.value === value;
        return (
          <div
            key={key}
            className={cn(
              "group bg-brand-500 grow cursor-pointer relative block rounded-xl",
              shadowClassName,
              {
                "bg-brand-500 border border-black": isSelected,
                [selectedShadowClassName]: isSelected,
              }
            )}
          >
            <div
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={cn(
                "border border-black h-full min-h-10 relative rounded-xl group-hover:-translate-y-1 group-hover:-translate-x-1 bg-white p-4 transition-all text-center overflow-hidden",
                buttonClassName,
                {
                  "-translate-y-1 -translate-x-1 ": isSelected,
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
