import type { ReactNode } from "react";
import { HeaderIconButton } from "~/components/common/HeaderIconButton";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";

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
