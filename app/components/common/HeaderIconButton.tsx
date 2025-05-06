import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

export const HeaderIconButton = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) => {
  return (
    <div className="bg-black h-max rounded-xl group" onClick={onClick}>
      <span
        className={cn(
          "group-hover:-translate-x-1 group-hover:-translate-y-1 transition-all block cursor-pointer"
        )}
      >
        {children}
      </span>
    </div>
  );
};
