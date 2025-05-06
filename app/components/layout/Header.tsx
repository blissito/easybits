import type { ReactNode } from "react";
import { HeaderIconButton } from "~/components/common/HeaderIconButton";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";
import { cn } from "~/utils/cn";
import { LayoutIcon } from "../illustrations/LayoutIcon";

export const Header = ({
  className,
  title,
  noButtons,
  cta,
  folded,
  isFolded,
}: {
  cta?: ReactNode;
  noButtons?: boolean;
  title?: string;
  className?: string;
  folded?: () => void;
  isFolded: boolean;
}) => {
  return (
    <nav
      className={cn(
        "flex justify-between flex-wrap md:flex-nowrap items-center relative mb-6 md:mb-10  ",
        className
      )}
    >
      <h1 className="text-3xl lg:text-4xl m-0 p-0 font-semibold ">{title}</h1>
      <div className="flex gap-3">
        {!noButtons && (
          <>
            <HeaderIconButton>
              <LupaIcon />
            </HeaderIconButton>
            <HeaderIconButton onClick={folded}>
              {isFolded ? <ListIcon /> : <LayoutIcon />}
            </HeaderIconButton>
            {cta}
          </>
        )}
      </div>
    </nav>
  );
};
