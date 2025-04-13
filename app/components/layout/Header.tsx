import type { ReactNode } from "react";
import { HeaderIconButton } from "~/components/common/HeaderIconButton";
import { ListIcon } from "~/components/illustrations/ListIcon";
import { LupaIcon } from "~/components/illustrations/LupaIcon";
import { cn } from "~/utils/cn";

export const Header = ({
  className,
  title,
  noButtons,
  cta,
}: {
  cta?: ReactNode;
  noButtons?: boolean;
  title?: string;
  className?: string;
}) => {
  return (
    <nav
      className={cn(
        "flex justify-between flex-wrap md:flex-nowrap items-center relative mb-6 md:mb-10  ",
        className
      )}
    >
      <h1 className="text-3xl lg:text-4xl  my-auto font-semibold ">{title}</h1>
      <div className="flex gap-3 mt-4 md:mt-0">
        {!noButtons && (
          <>
            <HeaderIconButton>
              <LupaIcon />
            </HeaderIconButton>
            <HeaderIconButton>
              <ListIcon />
            </HeaderIconButton>
            {cta}
          </>
        )}
      </div>
    </nav>
  );
};
