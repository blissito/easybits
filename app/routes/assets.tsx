import { useState } from "react";
import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { BrutalButton } from "~/components/common/BrutalButton";
import { AssetFormModal } from "~/components/forms/AssetFormModal";
import { MagicWand } from "~/components/illustrations/MagicWand";
import type { Route } from "./+types/assets";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
    },
  });
  return { assets: [] };
};

export default function Assets({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <article className="min-h-screen overflow-hidden py-20 px-10 w-full relative box-border inline-block">
        <GridBackground />
        <h1 className="text-3xl relative z-20">Mis assets digitales</h1>
        {assets.length < 1 && <Empty onClick={() => setShowModal(true)} />}
      </article>
      <AssetFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

const Empty = ({ onClick }: { onClick?: () => void }) => {
  return (
    <section className="z-20 relative grid place-content-center place-items-center min-h-[70vh]">
      <div className="mb-10">
        <MagicWand />
      </div>
      <h2 className="text-2xl font-bold mb-4">Agrega tu primer producto</h2>
      <p className="text-lg text-brand-gray text-center mb-10">
        No lo pienses más, no tiene que se perfecto. <br />
        ¡No sabrás si funciona si no lo intentas!
      </p>

      <BrutalButton onClick={onClick} className="bg-brand-500">
        + Agregar
      </BrutalButton>
    </section>
  );
};
