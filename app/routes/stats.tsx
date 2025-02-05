import { GridBackground } from "~/components/common/backgrounds/GridBackground";

export default function Stats() {
  return (
    <>
      <article className="py-20 px-10 min-h-screen w-full relative box-border inline-block">
        <GridBackground />
        <h1 className="text-3xl relative z-20">Stats</h1>
      </article>
    </>
  );
}
