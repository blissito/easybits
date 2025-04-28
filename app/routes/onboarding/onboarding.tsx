import { Link, useFetcher } from "react-router";
import { cn } from "~/utils/cn";
import Logo from "/logo-purple.svg";
import { FlipLetters } from "~/components/animated/FlipLetters";
import { Steper } from "./Steper";
import type { Route } from "./+types/onboarding";
import { getUserOrRedirect } from "~/.server/getters";

export const action = async ({ request }: Route.ActionArgs) => {
  // const formData = await request.formData();
  // const intent = formData.get("intent") as string;
  return null;
};

// @todo if metadata already there, avoid.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  return { user };
};

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section
      className={cn(
        "bg-white h-screen flex  w-full ",
        "md:flex-row relative",
        "overflow-hidden"
      )}
    >
      <Link to="/">
        <div className="flex gap-3 absolute left-4 lg:left-20">
          <img src={Logo} alt="easybits" className="w-12" />
          <FlipLetters word="EasyBits" type="light" />
        </div>
      </Link>

      <Steper user={user} />
    </section>
  );
}
