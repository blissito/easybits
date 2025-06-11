import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/storeEdition";
import { db } from "~/.server/db";
import { StoreTemplate } from "./storeTemplate";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // get store details
  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
      // published: true, // @todo publish switch in form?
    },
    include: {
      user: true,
    },
  });
  return { assets, user };
};

export default function Index({ loaderData }: Route.ComponentProps) {
  const { assets, user } = loaderData;
  return <StoreTemplate user={user} assets={assets} />;
}
