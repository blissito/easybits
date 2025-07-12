import { EditAssetForm } from "./EditAssetForm";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/EditAsset";
import { db } from "~/.server/db";
import { Link, redirect } from "react-router";
import { useEffect, useState } from "react";
import { AssetPreview } from "./AssetPreview";
import { FaArrowLeft } from "react-icons/fa";

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
    <article className="w-full ">
      <nav className="flex items-center border-black border-b md:ml-20 box-border md:pt-4 pt-16 pb-4">
        <Link
          prefetch="intent"
          to="/dash/assets"
          className="ml-4 md:ml-6 hover:scale-105 transition-all"
        >
          <span className="text-black text-2xl lg:text-3xl">
            <FaArrowLeft />
          </span>
        </Link>
        <h1
          className={cn(
            "text-3xl md:text-4xl font-bold md:pl-6 ",
            PADDING_LAYOUT
          )}
        >
          {asset.title}
        </h1>
      </nav>
      <main className={cn("grid grid-cols-12 md:pl-20 items-start ")}>
        <EditAssetForm
          // files={files}
          assetFiles={files}
          host={host}
          asset={asset}
          onUpdate={(form) => setPrev({ ...form, user: asset.user })}
        />
        <AssetPreview host={host} asset={prev} />
      </main>
    </article>
  );
}
