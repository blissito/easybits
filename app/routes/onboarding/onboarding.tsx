import { Link } from "react-router";
import { cn } from "~/utils/cn";
import Logo from "/logo-purple.svg";
import { FlipLetters } from "~/components/animated/FlipLetters";
import { Steper } from "./Steper";

export default function Onboarding() {
  return (
    <section
      className={cn("bg-white h-screen flex  w-full ", "md:flex-row relative")}
    >
      <Link to="/">
        <div className="flex gap-3 absolute left-4 lg:left-20">
          <img src={Logo} alt="easybits" className="w-12" />
          <FlipLetters word="EasyBits" type="light" />
        </div>
      </Link>
      <Steper />
    </section>
  );
}
