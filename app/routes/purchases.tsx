import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { Empty } from "./assets/Empty";
import type { Route } from "./+types/purchases";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { AssetCard } from "./assets/AssetCard";
import { BiLinkExternal } from "react-icons/bi";
import { Avatar } from "~/components/common/Avatar";
import { IoOpenOutline } from "react-icons/io5";
import { Link } from "react-router";
import { useOpenLink } from "~/hooks/useOpenLink";
import type { Asset, User } from "@prisma/client";

type AssetWithUser = Asset & { user: User };

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
      user: {
        select: {
          displayName: true,
          picture: true,
          host: true,
        },
      }, // @fix this
    },
  });
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
        <section
          className={cn(
            " max-w-7xl mx-auto px-4 grid gap-8 grid-cols-1",
            " md:px-[5%] xl:px-0  md:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {assets.map((asset) => {
            return <PurchaseCardBox asset={asset as AssetWithUser} />;
          })}
        </section>
      </article>
    </>
  );
}

const PurchaseCardBox = ({ asset }: { asset: AssetWithUser }) => {
  const { url } = useOpenLink({
    localLink: `http://${asset.user.host}.localhost:3000/tienda`,
    publicLink: `https://${asset.user.host}.easybits.cloud/tienda`,
  });
  return (
    <AssetCard
      to={`/dash/compras/${asset.id}`}
      key={asset.id}
      asset={asset}
      left={
        <div className=" flex gap-1 items-center pl-3 pb-3 mt-1">
          <Avatar className="h-6 w-6 " src={asset.user?.picture} />
          <Link to={url}>
            <p className="text-sm underline">{asset.user.displayName}</p>
          </Link>
        </div>
      }
      right={
        <Link className="text-2xl" to={`/dash/compras/${asset.id}`}>
          <IoOpenOutline />
        </Link>
      }
    />
  );
};

const EmptyPurchases = () => {
  return (
    <Empty
      illustration={
        <img
          className="w-44 mx-auto "
          src="/empty-states/purchases-empty.webp"
        />
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
