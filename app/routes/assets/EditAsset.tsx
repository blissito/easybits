import { EditAssetForm } from "./EditAssetForm";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/EditAsset";
import { db } from "~/.server/db";
import { AssetPreview } from "./AssetPreview";

const PADDING_LAYOUT = `pl-4`;

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({
    where: {
      id: params.assetId,
      userId: user.id,
    },
  });
  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
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
  // return null;
  return (
    <article className="w-screen">
      <h1
        className={cn(
          "text-3xl md:text-4xl font-bold  md:pt-4 pt-16 pb-4 border-b border-black md:pl-24",
          PADDING_LAYOUT
        )}
      >
        {asset.title}
      </h1>
      <main className={cn("flex md:pl-20")}>
        <EditAssetForm
          files={files}
          assetFiles={files}
          host={host}
          asset={asset}
        />
        <AssetPreview host={host} asset={asset} />
      </main>
    </article>
  );
}
