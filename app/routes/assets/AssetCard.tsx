import type { Asset } from "@prisma/client";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode } from "react";
import { Link } from "react-router";
import { CopyButton } from "~/components/common/CopyButton";
import { FaExternalLinkAlt } from "react-icons/fa";
import { usePublicLink } from "~/hooks/usePublicLink";
import { cn } from "~/utils/cn";

// Helper function to get the metaImage URL for an asset
const getMetaImageUrl = (asset: Asset): string => {
  // Use the standard metaImage path that gets generated automatically
  return `https://easybits-public.fly.storage.tigris.dev/${asset.userId}/gallery/${asset.id}/metaImage`;
};

export const AssetCard = ({
  left,
  asset,
  right,
  to,
}: {
  to?: string;
  left?: ReactNode;
  asset: Asset;
  right?: ReactNode;
}) => {
  const publicLink = usePublicLink(asset as any);

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.1, bounce: 0.2 }}
      className="group bg-black rounded-2xl"
    >
      <div
        className={cn(
          "min-h-[264px]",
          "group-hover:-translate-x-2 group-hover:-translate-y-2", // brutalism
          "group bg-white rounded-xl transition-all",
          "flex flex-col",
          "border-2 border-black rounded-2xl",
          "overflow-hidden"
        )}
      >
        <Link
          prefetch="render"
          to={to || `/dash/assets/${asset.id}/edit`}
          className=""
        >
          <img
            className="h-[180px] object-cover w-full flex-grow-0"
            src={getMetaImageUrl(asset)}
            alt="cover"
          />
          <h3 className="font-bold text-lg px-3 border-t border-t-black pt-3 h-full line-clamp-1">
            {asset.title || asset.slug || asset.template?.slug}
          </h3>
        </Link>
        <nav className="flex justify-between  items-center pr-4 mt-1 mb-1 ">
          {left ? (
            left
          ) : (
            <p className="text-brand-gray px-3 ">${asset.price || 0} mxn</p>
          )}
          {right ? (
            right
          ) : (
            <a
              href={publicLink || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-gray"
            >
              <img
                alt="external link"
                src="/icons/opentab.svg"
                className="w-6 h-6"
              />
            </a>
          )}
        </nav>
      </div>
    </motion.main>
  );
};

export const CollapsedAssetCard = ({
  asset,
  to,
  host,
  orderCount,
  salesAmount,
}: {
  to?: string;
  asset: Asset;
  host?: string;
  salesAmount?: number;
  orderCount?: number;
}) => {
  const publicLink = usePublicLink(asset, host);

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.1, bounce: 0.2 }}
      className="group bg-black rounded-2xl w-full "
    >
      <div
        className={cn(
          "min-h-[94px] w-full",
          "group-hover:-translate-x-2 group-hover:-translate-y-2 ", // brutalism
          "group bg-white p-4 rounded-xl transition-all",
          "grid grid-cols-12 gap-2 md:gap-6 ",
          "border-2 border-black rounded-2xl",
          "overflow-hidden"
        )}
      >
        <Link
          to={to || `/dash/assets/${asset.id}/edit`}
          className="flex gap-6 col-span-3 md:col-span-5 items-center"
        >
          <img
            className="h-16 w-20 object-cover rounded-xl flex-grow-0 hidden md:block"
            src={asset.gallery?.[0] || "/images/easybits-default.webp"}
            alt="cover"
          />
          <div>
            <h3 className="font-bold text-base md:text-lg  ">
              {asset.title || asset.slug || asset.template?.slug}
            </h3>
            <p className="hidden md:block">{publicLink} </p>
          </div>
        </Link>
        <div className="col-span-2 place-content-center hidden md:block">
          <StatusTag published={asset.published} />
        </div>
        <div className="col-span-3 md:col-span-2 place-content-center">
          ${asset.price || 0} mxn
        </div>
        <div className="col-span-2 md:col-span-1 place-content-center">
          {orderCount}
        </div>
        <div className="col-span-3 md:col-span-1 place-content-center">
          ${salesAmount} mxn
        </div>
        <div className="col-span-1 place-content-center">
          {" "}
          <CopyButton className="" text={publicLink} />
        </div>
      </div>
    </motion.main>
  );
};

const StatusTag = ({ published }: { published: boolean }) => {
  return (
    <div
      className={cn(
        "h-7 rounded-full w-fit px-4 bg-emerald text-center flex items-center text-black border border-black",
        {
          "bg-maya": !published,
        }
      )}
    >
      <span> {published ? "Publicado" : "Sin publicar"}</span>
    </div>
  );
};
