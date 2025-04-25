import StoreComponent from "~/components/store/StoreComponent";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import GlobeIcon from "/icons/globe.svg";
import { useHostEditor } from "~/hooks/useHostEditor";
import type { Route } from "./+types/store";

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

export default function Store({ loaderData }: Route.ComponentProps) {
  const { assets, user } = loaderData;
  const { onOpen, Modal } = useHostEditor({ user });
  // @todo StoreComponent should be two components, the template (display) one and the config one with the edit buttons, something like:
  //  <> <StoreEditor /> <StoreDisplay /> </>
  return (
    <div className=" w-full flex justify-center">
      <Modal />
      <StoreComponent
        user={user}
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
