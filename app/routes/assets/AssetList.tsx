import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

export const AssetList = ({
  children,
  isFolded,
}: {
  children: ReactNode;
  isFolded?: boolean;
}) => {
  return (
    <article className="relative   ">
      <section
        className={cn("grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-4", {
          "grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6": isFolded,
        })}
      >
        {children}
      </section>
    </article>
  );
};
