import { FaArrowLeft } from "react-icons/fa";
import { Link } from "react-router";
import { cn } from "~/utils/cn";
import type { Route } from "./+types/purchase_detail";
import { db } from "~/.server/db";
import { getFilesForAssetId, getUserOrRedirect } from "~/.server/getters";
import { DownloablePreview } from "./viewer/DownloablePreview";

const LAYOUT_PADDING = "py-16 md:py-10";

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
      //   viewer = <Downloadable files={files} asset={asset} />;
      viewer = <DownloablePreview asset={asset} files={files} />;
  }

  return (
    <article
      className={cn(
        "text-white bg-black",
        " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8 2xl:px-0",

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
      <section className="my-12">{viewer}</section>
    </article>
  );
}
