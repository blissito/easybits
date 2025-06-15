import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { Empty } from "./assets/Empty";
import type { Route } from "./+types/purchases";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { AssetCard } from "./assets/AssetCard";
import { BiLinkExternal } from "react-icons/bi";

const LAYOUT_PADDING = "py-16 md:py-10";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const assets = await db.asset.findMany({
    where: {
      id: {
        in: user.assetIds,
      },
    },
    include: {
      user: false, // @fix this
    },
  });
  console.log(user.assetIds, user, "checale");

  return { assets };
};

export default function Purchases({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  return (
    <>
      <article
        className={cn(
          " min-h-svh w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8 2xl:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Mis compras" />
        {assets.length < 1 && <EmptyPurchases />}
        <section className="flex gap-4 flex-wrap">
          {assets.map((asset) => (
            <AssetCard
              to={`/dash/compras/${asset.id}`}
              key={asset.id}
              asset={asset}
              left={<p className="h-10" />}
              right={
                <a className="text-2xl">
                  <BiLinkExternal />
                </a>
              }
            />
          ))}
        </section>
      </article>
    </>
  );
}

const EmptyPurchases = () => {
  return (
    <Empty
      illustration={
        <img className="w-44 mx-auto " src="/purchases-empty.webp" />
      }
      title=" ¡Vaya, vaya! Ningún asset por aquí"
      text={<span>Explora el catálogo y compra tu primer asset</span>}
      footer={
        <BrutalButton className=" flex gap-2 items-center">
          Explorar
        </BrutalButton>
      }
    />
  );
};
