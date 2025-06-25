import { EditAssetForm } from "./EditAssetForm";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/EditAsset";
import { db } from "~/.server/db";
import { redirect } from "react-router";
import { useEffect, useState } from "react";
import { AssetPreview } from "./AssetPreview";
import { FloatingImageGenAssistant } from "~/components/ai/FloatingImageGenAssistant";

const PADDING_LAYOUT = `pl-4`;

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({
    where: {
      id: params.assetId,
      userId: user.id,
    },
    include: { user: true },
  });
  if (!asset) return redirect("/dash/assets");
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

export default function EditAsset({ loaderData }: Route.ComponentProps) {
  const { host, asset, files } = loaderData;
  const [prev, setPrev] = useState(asset);
  useEffect(() => {
    setPrev(asset);
  }, [asset]);
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
      <main className={cn("grid grid-cols-12 md:pl-20 items-start ")}>
        <EditAssetForm
          // files={files}
          assetFiles={files}
          host={host}
          asset={asset}
          onUpdate={(form) => setPrev(form)}
        />
        <AssetPreview host={host} asset={prev} />
      </main>
      <FloatingImageGenAssistant
        imageUrl="https://placekitten.com/400/400"
        prompt="gato con sombrero"
      />
    </article>
  );
}
