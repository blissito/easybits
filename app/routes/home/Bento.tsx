import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

// reusable example instead of multiples bentos:
export const Bento = ({
  title,
  children,
  image,
  position = "left",
  className,
}: {
  position?: "left" | "right";
  title: string;
  image?: string;
  children: ReactNode;
  className?: string;
}) => {
  return (
    <article
      className={cn(
        "border-b-black border-b-[2px] lg:min-h-[680px] flex flex-row-reverse flex-wrap md:flex-nowrap",
        {
          "flex-row": position === "right",
        },
        className
      )}
    >
      <section className="w-full md:w-[50%]  h-[384px] md:h-[480px] lg:h-[680px] ">
        <img
          className="w-full h-full object-cover bg-center border-x-[0px] border-b-[2px] md:border-b-[0px] md:border-x-[2px] border-black"
          src={image}
          alt="purchaising example"
        />
      </section>
      <section className="w-full md:w-[50%] grid place-content-center p-10 md:px-12 xl:px-20 md:py-0">
        <h3 className="text-3xl lg:text-4xl font-bold">{title}</h3>
        {children}
      </section>
    </article>
  );
};
