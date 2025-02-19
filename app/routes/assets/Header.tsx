import type { ReactNode } from "react";
import { HeaderIconButton } from "~/components/common/HeaderIconButton";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";

export const Header = () => {
  return (
    <nav className="flex justify-between h-12 relative z-20 mb-8">
      <h1 className="text-4xl font-bold">Mis Assets digitales</h1>
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
