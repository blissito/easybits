import { Link, useFetcher } from "react-router";
import { cn } from "~/utils/cn";
import { BrandLogo } from "~/components/common/BrandLogo";
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
  // A dónde iba antes de que lo mandáramos a llenar el perfil
  const next = new URL(request.url).searchParams.get("next");
  return { user, next };
};

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const { user, next } = loaderData;

  return (
    <section
      className={cn(
        "bg-white  box-border h-svh flex  w-full ",
        "md:flex-row relative",
        "overflow-hidden"
      )}
    >
      <BrandLogo
        to="/"
        theme="light"
        className="absolute left-4 xl:left-20 z-10"
      />

      <Steper user={user} next={next} />
    </section>
  );
}
