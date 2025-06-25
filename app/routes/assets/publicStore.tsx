// @DEPRECATED
import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "./+types/publicStore";
import { db } from "~/.server/db";
import type { Asset } from "@prisma/client";
import { StoreTemplate } from "../store/storeTemplate";
import getBasicMetaTags from "~/utils/getBasicMetaTags";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const host = url.hostname.split(".")[0]; // host
  console.info("::STORE::HOST::", host);
  const hostExists = await db.user.findFirst({
    where: { host },
  });

  const domainExists = await db.user.findFirst({
    where: { domain: url.hostname },
  });

  let assets: Asset[] = [];
  let user = null;
  
  if (hostExists) {
    user = hostExists;
    assets = await db.asset.findMany({
      where: {
        userId: hostExists.id,
        //   published:true // @todo activate?
      },
      include: {
        user: true,
      },
    });
  }
  if (domainExists) {
    user = domainExists;
    assets = await db.asset.findMany({
      where: {
        userId: domainExists.id,
        //   published:true // @todo activate?
      },
      include: {
        user: true,
      },
    });
  }

  return { assets, user };
};

export const meta = ({
  data,
}: Route.MetaArgs) => {
  // Get user info from the data
  const user = data?.user;
  
  return getBasicMetaTags({
    title: (user as any)?.storeConfig?.metadata?.title || user?.displayName || "Creador EasyBits",
    description: (user as any)?.storeConfig?.metadata?.description || 
      `Descubre increíbles assets digitales en la tienda de ${user?.displayName || "este creador"} 🚀`,
    // @todo get this from config?
    image: (user as any)?.storeConfig?.metadata?.image || user?.storeConfig?.coverImage|| user?.storeConfig?.logoImage || `/metaImage-tienda.webp`,
  });
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  return <StoreTemplate assets={assets} />;
}
