import { FaArrowLeft } from "react-icons/fa";
import { Link } from "react-router";
import { cn } from "~/utils/cn";
import type { Route } from "./+types/purchase_detail";
import { db } from "~/.server/db";
import { getFilesForAssetId, getUserOrRedirect } from "~/.server/getters";
import { DownloablePreview } from "./viewer/DownloablePreview";

const LAYOUT_PADDING = "p-4  md:px-20";

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

  return {
    asset,
    files: await getFilesForAssetId(asset.id),
  };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { asset, files } = loaderData;

  let viewer;
  // VOD_COURSE
  // EMAIL_COURSE
  // WEBINAR
  // EBOOK
  // DOWNLOADABLE
  switch (asset.type) {
    case "DOWNLOADABLE":
      viewer = <DownloablePreview asset={asset} files={files} />;
  }

  return (
    <article
      className={cn(
        "text-white bg-black min-h-svh h-full bg-patternDark",
        "w-full",
        LAYOUT_PADDING
      )}
    >
      <Link
        prefetch="intent"
        to="/dash/compras"
        className="inline-flex gap-3 p-3"
      >
        <span className="flex items-center gap-2">
          <FaArrowLeft />
        </span>
        <span>Ir al dashboard</span>
      </Link>
      <section className="mt-6 md:my-24">{viewer}</section>
    </article>
  );
}
