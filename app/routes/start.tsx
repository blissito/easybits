import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import StartComponent from "~/components/start/StartComponent";

export default function Start() {
  return (
    <div className="flex justify-center items-center relative z-10 w-full min-h-[90vh]">
      <StartComponent />
    </div>
  );
}
