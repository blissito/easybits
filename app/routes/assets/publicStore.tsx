// @DEPRECATED
import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "./+types/publicStore";
import { db } from "~/.server/db";
import type { Asset } from "@prisma/client";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const host = url.hostname.split(".")[0]; // host
  const hostExists = await db.user.findFirst({
    where: { host },
  });

  const domainExists = await db.user.findFirst({
    where: { domain: url.hostname },
  });

  let assets: Asset[] = [];
  if (hostExists) {
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

  return { assets };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  return <StoreComponent assets={assets} />;
}
