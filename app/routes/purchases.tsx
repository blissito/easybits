import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { Empty } from "./assets/Empty";

const LAYOUT_PADDING = "py-16 md:py-10";

export default function Purchases() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8 xl:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Mis compras" />
        <EmptyPurchases />
      </article>
    </>
  );
}

const EmptyPurchases = () => {
  return (
    <Empty
      illustration={
        <img className="w-44 mx-auto " src="/purchases-empty.webp" />
      }
      title=" ¡Vaya, vaya! Ningún asset por aquí"
      text={<span>Explora el catálogo y compra tu primer asset</span>}
      footer={
        <BrutalButton className=" flex gap-2 items-center">
          Explorar
        </BrutalButton>
      }
    />
  );
};
