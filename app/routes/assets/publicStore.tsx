import StoreComponent from "~/components/store/StoreComponent";
import type { Route } from "./+types/publicStore";
import { db } from "~/.server/db";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const host = url.hostname.split(".")[0]; // host
  const hostExists = await db.user.findFirst({
    where: { host },
  });
  //   if (!hostExists && host !== "localhost")
  if (!hostExists) throw new Response("Seller not found", { status: 404 });

  const assets = await db.asset.findMany({
    where: {
      userId: hostExists.id,
      //   published:true // @todo activate?
    },
    include: {
      user: true,
    },
  });
  return { assets };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { assets } = loaderData;
  return <StoreComponent assets={assets} />;
}
