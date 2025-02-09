import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

// reusable example instead of multiples bentos:
export const Bento = ({
  title,
  children,
  position = "left",
}: {
  position?: "left" | "right";
  title: string;
  children: ReactNode;
}) => {
  return (
    <article
      className={cn(
        "border-b-black border-b-[1px] lg:min-h-[680px] flex flex-row-reverse flex-wrap md:flex-nowrap",
        {
          "flex-row": position === "right",
        }
      )}
    >
      <section className="w-full md:w-[50%] bg-purple-600 h-[384px] md:h-[480px] lg:h-[680px]" />
      <section className="w-full md:w-[50%] grid place-content-center p-10 md:px-12 xl:px-20 md:py-0">
        <h3 className="text-3xl lg:text-4xl font-bold">{title}</h3>
        {children}
      </section>
    </article>
  );
};
