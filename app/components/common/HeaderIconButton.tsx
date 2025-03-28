import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

export const HeaderIconButton = ({ children }: { children: ReactNode }) => {
  return (
    <button className="bg-black h-max rounded-xl group">
      <span
        className={cn(
          "group-hover:-translate-x-1 group-hover:-translate-y-1 transition-all block"
        )}
      >
        {children}
      </span>
    </button>
  );
};
