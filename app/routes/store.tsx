import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "../+types/root";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import GlobeIcon from "/icons/globe.svg";
import { useHostEditor } from "~/hooks/useHostEditor";

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
  const { onOpen, Modal } = useHostEditor({ user });
  return (
    <div className=" w-full flex justify-center">
      <Modal />
      <StoreComponent
        assets={assets}
        cta={
          <button
            onClick={onOpen}
            className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px] active:"
          >
            <img className="w-full" src={GlobeIcon} />
          </button>
        }
      />
    </div>
  );
}
