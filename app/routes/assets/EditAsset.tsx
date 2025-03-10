import { FaBoxOpen, FaShare } from "react-icons/fa";
import { EditAssetForm } from "./EditAssetForm";
import { FaCopy } from "react-icons/fa6";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/EditAsset";
import { db } from "~/.server/db";
import { AssetPreview } from "./AssetPreview";

const PADDING_LAYOUT = `pl-10`;

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({
    where: {
      id: params.assetId,
      userId: user.id,
    },
  });
  return { host: user.host!, asset };
};

export default function EditAsset({ loaderData }: Route.ComponentProps) {
  const { host, asset } = loaderData;
  return (
    <article
      className={cn(
        "relative z-10 flex-1" // hack because of the animated background
      )}
    >
      <h1 className={cn("text-4xl py-4 border-b border-black", PADDING_LAYOUT)}>
        Template UI
      </h1>
      <main className={cn("flex gap-12 justify-evenly", PADDING_LAYOUT)}>
        <EditAssetForm host={host} asset={asset} />
        <AssetPreview />
      </main>
    </article>
  );
}
