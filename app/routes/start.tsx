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
    tasks: {
      0: true,
      1: assetsCount > 0,
    },
  };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { tasks } = loaderData;
  return <StartComponent tasks={tasks} />;
}
