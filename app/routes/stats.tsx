import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import StatsComponent from "~/components/stats/StatsComponent";

export default function Stats() {
  return (
    <>
      <section className="py-20 px-10 w-full relative h-screen">
        <GridBackground />
        <div className="relative z-10 w-full h-full">
          <StatsComponent />
        </div>
      </section>
    </>
  );
}
