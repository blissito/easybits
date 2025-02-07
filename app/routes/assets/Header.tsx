import type { ReactNode } from "react";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";
import { cn } from "~/utils/cn";

export const Header = () => {
  return (
    <nav className="flex justify-between my-4 relative z-20">
      <h1 className="text-3xl mb-12">Mis Assets digitales</h1>
      <div className="flex gap-3">
        <HeaderIconButton>
          <LupaIcon />
        </HeaderIconButton>
        <HeaderIconButton>
          <ListIcon />
        </HeaderIconButton>
      </div>
    </nav>
  );
};

const HeaderIconButton = ({ children }: { children: ReactNode }) => {
  return (
    <button className="bg-black h-max rounded-lg group">
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
