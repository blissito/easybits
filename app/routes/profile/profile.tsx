import type { User } from "@prisma/client";
import type { Route } from "./+types/profile";
import { ProfileCard, SuscriptionCard } from "./profileComponents";
import { getUserOrRedirect } from "~/.server/getters";

export const loader = async ({ request }: Route.ClientLoaderArgs) => {
  return {
    user: await getUserOrRedirect(request),
  };
};

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <article className=" min-h-screen w-full relative box-border inline-block md:py-10 pt-16 pb-6 px-4 md:pr-[5%] md:pl-[10%] xl:px-0">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold pt-1 md:pt-1">
          Perfil
        </h2>
        <ProfileCard user={user} />
        <SuscriptionCard />
      </div>
    </article>
  );
}
