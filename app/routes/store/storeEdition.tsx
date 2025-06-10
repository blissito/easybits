import { useEffect, type ReactNode } from "react";
import { getUserOrRedirect } from "~/.server/getters";
import { Footer } from "~/components/common/Footer";
import { AuthNav } from "~/components/login/auth-nav";
import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "./+types/storeEdition";
import { db } from "~/.server/db";
import StoreConfigForm from "~/components/store/StoreConfigForm";
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
  return (
    <main className="bg-brand_dark relative">
      <StoreTemplate user={user} assets={assets} />
      {/* <div className=" absolute  w-[calc(100vw-680px)] left-10 ">
     
      </div> */}
      {/* <StoreConfigForm
        isOpen={true}
        onClose={() => setIsConfigOpen(false)}
        storeConfig={user?.storeConfig}
      /> */}
    </main>
  );
}
