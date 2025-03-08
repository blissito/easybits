import { useState } from "react";
import { AssetFormModal } from "~/components/forms/AssetFormModal";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { AssetList } from "./AssetList";
import { Header } from "../../components/layout/Header";
import { Empty } from "./Empty";
import type { Route } from "./+types/assets";
import { cn } from "~/utils/cn";

const PADDING_LAYOUT = `pl-10`;

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
    },
  });
  return { assets };
};

export default function Assets({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <article
        className={cn(
          "min-h-[95vh]  w-full relative box-border inline-block",
          PADDING_LAYOUT
        )}
      >
        <Header title="Mis Assets digitales" />
        {assets.length < 1 && <Empty onClick={() => setShowModal(true)} />}
        <AssetList assets={assets} />
      </article>
      <AssetFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
