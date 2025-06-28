import { getUserOrRedirect } from "~/.server/getters";
import StartComponent from "~/components/start/StartComponent";
import type { Route } from "./+types/start";
import { db } from "~/.server/db";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const assetsCount = await db.asset.count({
    where: {
      userId: user.id,
    },
  });
  return {
    user,
    tasks: {
      0: true,
      1: assetsCount > 0,
      2: !!user.stripeId,
      3: false, // @todo revisit?
      4: false, // this both are localStorare in client
    },
  };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { tasks, user } = loaderData;
  return <StartComponent tasks={tasks} user={user} />;
}
