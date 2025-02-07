import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import StartComponent from "~/components/start/StartComponent";

export default function Start() {
  return (
    <>
      <section className="py-20 px-10 w-full relative h-screen">
        <GridBackground />
        <div className="flex justify-center items-center relative z-10 w-full h-full">
          <StartComponent />
        </div>
      </section>
    </>
  );
}
