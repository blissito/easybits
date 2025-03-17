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
    <article className=" min-h-screen w-full relative box-border inline-block md:py-10 py-6 px-4 md:px-[5%] lg:px-0">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-semibold">Perfil</h2>
        <ProfileCard user={user} />
        <SuscriptionCard />
      </div>
    </article>
  );
}
