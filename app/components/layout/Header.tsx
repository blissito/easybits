import type { ReactNode } from "react";
import { HeaderIconButton } from "~/components/common/HeaderIconButton";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";
import { cn } from "~/utils/cn";

export const Header = ({
  className,
  title,
  noButtons,
}: {
  noButtons?: boolean;
  title?: string;
  className?: string;
}) => {
  return (
    <nav
      className={cn(
        "flex justify-between items-center relative mb-6 md:mb-10 ",
        className
      )}
    >
      <h1 className="text-3xl md:text-4xl font-bold ">{title}</h1>
      <div className="flex gap-3">
        {!noButtons && (
          <>
            <HeaderIconButton>
              <LupaIcon />
            </HeaderIconButton>
            <HeaderIconButton>
              <ListIcon />
            </HeaderIconButton>
          </>
        )}
      </div>
    </nav>
  );
};
