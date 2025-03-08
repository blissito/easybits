import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";

const LAYOUT_PADDING = "pl-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Clients() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block",
          LAYOUT_PADDING
        )}
      >
        <Header title="Clientes" />
      </article>
    </>
  );
}
