import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";

const LAYOUT_PADDING = "py-6 md:py-10";

export default function Purchases() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:px-[5%] lg:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Mis compras" />
      </article>
    </>
  );
}
