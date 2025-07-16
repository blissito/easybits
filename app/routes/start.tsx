import { getUserOrRedirect } from "~/.server/getters";
import StartComponent from "~/components/start/StartComponent";
import type { Route } from "./+types/start";
import { db } from "~/.server/db";
import WelcomeAi from "~/components/start/WelcomeAi";
import { useEffect, useState } from "react";

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
  const [allTasksDone, setAllTasksDone] = useState(false);

  useEffect(() => {
    const landing = Number(localStorage.getItem("landingFlag")) === 1;
    const share = Number(localStorage.getItem("shareFlag")) === 1;
    setAllTasksDone(tasks[0] && tasks[1] && tasks[2] && landing && share);
  }, [tasks]);

  return allTasksDone ? <WelcomeAi user={user} /> : <StartComponent tasks={tasks} user={user} />;
}
