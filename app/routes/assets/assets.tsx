import { useState } from "react";
import { AssetFormModal } from "~/components/forms/AssetFormModal";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";
import { AssetList } from "./AssetList";
import { Header } from "../../components/layout/Header";
import { Empty } from "./Empty";
import type { Route } from "./+types/assets";
import { cn } from "~/utils/cn";
import { BrutalButton } from "~/components/common/BrutalButton";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
    },
    include: {
      user: true,
    },
  });
  return { assets };
};

export default function Assets({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  const [showModal, setShowModal] = useState(false);

  return (
    <section className="max-w-7xl w-full mx-auto  box-border pt-16 pb-6 md:py-10 px-4 md:pl-28 md:pr-8  2xl:px-0">
      <article className={cn("flex-1 items-center  ")}>
        <Header
          cta={
            assets.length > 0 && (
              <BrutalButton onClick={() => setShowModal(true)}>
                Crear asset
              </BrutalButton>
            )
          }
          title="Mis Assets digitales"
          className="mt-[6px] gap-y-2"
        />
        {assets.length < 1 && <Empty onClick={() => setShowModal(true)} />}
        <AssetList assets={assets} />
      </article>
      <AssetFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </section>
  );
}
