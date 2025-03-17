import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "../+types/root";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // get store details
  const assets = await db.asset.findMany({
    // where: {
    //   userId: user.id,
    // },
  });
  return { assets, user };
};

export default function Store({ loaderData }) {
  const { assets, user } = loaderData;
  return (
    <div className="relative w-full">
      <StoreComponent assets={assets} />
    </div>
  );
}
