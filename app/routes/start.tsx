import { getUserOrRedirect } from "~/.server/getters";
import StartComponent from "~/components/start/StartComponent";
import type { Route } from "./+types/start";
import { db } from "~/.server/db";
import WelcomeAi from "~/components/start/WelcomeAi";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const assetsCount = await db.asset.count({
    where: {
      userId: user.id,
    },
  });
  
  // Asegurar que el usuario tenga el campo trained
  const userWithTrained = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      confirmed: true,
      trained: true,
      stripeId: true,
      email: true,
      displayName: true,
      verified_email: true,
      family_name: true,
      given_name: true,
      picture: true,
      phoneNumber: true,
      roles: true,
      metadata: true,
      stripeIds: true,
      host: true,
      dnsConfig: true,
      domain: true,
      newsletters: true,
      notifications: true,
      assetIds: true,
      customer: true,
      createdAt: true,
      updatedAt: true,
      storeConfig: true,
    }
  });
  
  const tasks = {
    0: true,
    1: assetsCount > 0,
    2: !!user.stripeId,
    3: false, // @todo revisit?
    4: false, // this both are localStorare in client
  };

  // Si el usuario ya está entrenado, mostrar WelcomeAi
  if (userWithTrained?.trained) {
    return {
      user: userWithTrained,
      tasks,
      showWelcomeAi: true,
    };
  }

  // Si no está entrenado, mostrar StartComponent
  return {
    user: userWithTrained,
    tasks,
    showWelcomeAi: false,
  };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { tasks, user, showWelcomeAi } = loaderData;

  if (!user) return null;
  
  return showWelcomeAi ? <WelcomeAi user={user} /> : <StartComponent tasks={tasks} user={user} />;
}
