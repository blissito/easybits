import StoreComponent from "~/components/store/StoreComponent";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import GlobeIcon from "/icons/globe.svg";
import { DNSModal, useDisclosure } from "~/hooks/DNSToolkit";
import type { Route } from "./+types/store";
import { useEffect } from "react";
import { useTelemetry } from "~/hooks/useTelemetry";

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
  const { onOpen, isOpen, onClose } = useDisclosure({ user });

  useTelemetry({ ownerId: user.id, linkType: "store" });

  return (
    <div className=" w-full flex justify-center">
      <DNSModal onOpen={onOpen} onClose={onClose} user={user} isOpen={isOpen} />
      <StoreComponent
        variant="slim"
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
