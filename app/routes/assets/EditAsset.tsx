import { EditAssetForm } from "./EditAssetForm";
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
  const files = await db.file.findMany({
    where: {
      assetIds: {
        has: asset!.id,
      },
    },
  });
  return { host: user.host!, asset, files };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  // const intent = formData.get("intent");
  return null;
};

export default function EditAsset({ loaderData }: Route.ComponentProps) {
  const { host, asset, files } = loaderData;

  return (
    <article
      className={cn(
        "relative z-10 flex-1" // hack because of the animated background
      )}
    >
      <h1 className={cn("text-4xl py-4 border-b border-black", PADDING_LAYOUT)}>
        {asset.title}
      </h1>
      <main className={cn("flex gap-12 justify-evenly", PADDING_LAYOUT)}>
        <EditAssetForm assetFiles={files} host={host} asset={asset} />
        <AssetPreview />
      </main>
    </article>
  );
}
