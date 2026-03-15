import { EditAssetForm } from "./EditAssetForm";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/EditAsset";
import { db } from "~/.server/db";
import { Link, redirect } from "react-router";
import { useEffect, useState } from "react";
import { AssetPreview } from "./AssetPreview";
import { FaArrowLeft } from "react-icons/fa";
import { getAccountCapabilities } from "~/.server/stripe_v2";

const PADDING_LAYOUT = `pl-4`;

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const isProd = process.env.NODE_ENV === "production";
  const u = await getUserOrRedirect(request);
  const user = { ...u, stripeId: u.stripeIds[isProd ? 0 : 1] };
  const capabilities = await getAccountCapabilities(user.stripeId, !isProd);
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

  // Solo despublicar si es de tipo DOWNLOADABLE y no tiene archivos
  let assetToReturn = asset;
  if (asset.published && asset.type === "DOWNLOADABLE" && files.length === 0) {
    assetToReturn = await db.asset.update({
      where: { id: asset.id },
      data: { published: false },
      include: { user: true },
    });
  }

  // Asegurar que host nunca sea null
  return {
    host: user.host || "",
    asset: assetToReturn,
    files,
    onboardingDone: capabilities?.card_payments?.status === "active",
  };
};

export default function EditAsset({ loaderData }: Route.ComponentProps) {
  const { host, asset, files, onboardingDone } = loaderData;
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
      {asset.type === "EBOOK" && (
        <div className="md:pl-20 px-4 md:px-6 py-3 border-b border-black">
          <Link
            to={`/dash/assets/${asset.id}/book-editor`}
            className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black rounded-xl bg-white font-bold text-sm shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all"
          >
            Editar libro
          </Link>
        </div>
      )}
      <main className={cn("grid grid-cols-12 md:pl-20 items-start ")}>
        <EditAssetForm
          onboardingDone={onboardingDone}
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
