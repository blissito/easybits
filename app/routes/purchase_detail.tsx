import { FaArrowLeft } from "react-icons/fa";
import { Link } from "react-router";
import { cn } from "~/utils/cn";
import type { Route } from "./+types/purchase_detail";
import { db } from "~/.server/db";
import { getFilesForAssetId, getUserOrRedirect } from "~/.server/getters";
import { DownloablePreview } from "./viewer/DownloablePreview";
import { BookPreview } from "./viewer/BookPreview";


export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const asset = await db.asset.findUnique({
    where: {
      id: params.assetId,
    },
    include: { user: true },
  });
  if (!asset || !user.assetIds.includes(asset.id))
    throw new Response(null, { status: 404 });

  const reviewExists = await db.review.findFirst({
    where: {
      assetId: asset.id,
      userId: user.id,
    },
  });

  return {
    asset,
    files: await getFilesForAssetId(asset.id),
    reviewExists,
  };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { asset, files ,reviewExists} = loaderData;

  let viewer;
  // VOD_COURSE
  // EMAIL_COURSE
  // WEBINAR
  // EBOOK
  // DOWNLOADABLE
  switch (asset.type) {
    case "DOWNLOADABLE":
      viewer = <DownloablePreview asset={asset} files={files} reviewExists={reviewExists} />;
      break;
    case "EBOOK":
      viewer = <BookPreview asset={asset} files={files} reviewExists={reviewExists} />;
      break;
  }

  return (
    <article
      className={cn(
        "text-white bg-black min-h-svh h-full bg-pattern-dark relative",
        "w-full",
      )}
    >
      <Link
        prefetch="intent"
        to="/dash/compras"
        className="inline-flex gap-3 p-3 absolute top-6 left-32"
      >
        <span className="flex items-center gap-2">
          <FaArrowLeft />
        </span>
        <span>Ir al dashboard</span>
      </Link>
      <section className="">{viewer}</section>
    </article>
  );
}
