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
import { AssetCard, CollapsedAssetCard } from "./AssetCard";
import { usePublicLink } from "~/hooks/usePublicLink";
import { AnimatePresence } from "motion/react";
import { CopyButton } from "~/components/common/CopyButton";
import { Copy } from "~/components/common/Copy";

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
  const orders = await db.order.findMany({
    where: {
      assetId: {
        in: assets.map((a) => a.id),
      },
    },
  });

  return {
    assets,
    host: user.host || undefined,
    orders,
    salesAmount: 0,
  };
};

export default function Assets({ loaderData }: Route.ComponentProps) {
  const { assets, host, orders, salesAmount } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [isFolded, setIsFolded] = useState(false);

  return (
    <section className="max-w-7xl w-full mx-auto min-h-svh  box-border pt-16 pb-10 md:py-10 px-4 md:pl-28 md:pr-8  2xl:px-0">
      <article className={cn("flex-1 items-center  ")}>
        <Header
          cta={
            assets.length > 0 && (
              <BrutalButton id="CrearAsset" onClick={() => setShowModal(true)}>
                Crear asset
              </BrutalButton>
            )
          }
          title="Mis Assets digitales"
          className="mt-[6px] gap-y-2"
          folded={() => setIsFolded((value) => !value)}
          searcher={false}
          isFolded={isFolded}
        />
        {assets.length < 1 && <Empty onClick={() => setShowModal(true)} />}
        <AssetList isFolded={isFolded}>
          <AnimatePresence>
            {isFolded ? (
              <div className="grid grid-cols-12  gap-6 px-4 font-semibold">
                <div className="col-span-3 md:col-span-4 col-start-1 md:col-start-2 ">
                  Nombre
                </div>
                <div className="col-span-2 hidden md:block">Estatus</div>
                <div className="col-span-3 md:col-span-2">Precio</div>
                <div className="col-span-2 md:col-span-1">Ventas</div>
                <div className="col-span-3 md:col-span-1">Ingresos</div>
                <div className="col-span-1"></div>
              </div>
            ) : null}

            {assets?.map((asset) =>
              !isFolded ? (
                <AssetCard key={asset.id} asset={asset}  right={<CopyButton text={`https://${host}.easybits.cloud/tienda/${asset.slug}`}/> }/>
              ) : (
                <CollapsedAssetCard
                  key={asset.id}
                  asset={asset}
             
                  orderCount={
                    orders.filter((order, i) => asset.id === order.assetId)
                      .length
                  }
                  salesAmount={salesAmount}
                />
              )
            )}
          </AnimatePresence>
        </AssetList>
      </article>
      <AssetFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </section>
  );
}
