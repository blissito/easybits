import type { Asset } from "@prisma/client";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CopyButton } from "~/components/common/CopyButton";
import { usePublicLink } from "~/hooks/usePublicLink";
import { cn } from "~/utils/cn";

export const AssetCard = ({ asset }: { asset: Asset }) => {
  const publicLink = usePublicLink(asset);
  return (
    <main className="group bg-black rounded-2xl">
      <div
        className={cn(
          "min-h-full",
          "group-hover:-translate-x-2 group-hover:-translate-y-2", // brutalism
          "group bg-white rounded-xl transition-all",
          "flex flex-col",
          "border border-black rounded-2xl",
          "overflow-hidden"
        )}
      >
        <Link to={`${asset.id}/edit`} className="">
          <img
            className="h-[180px] object-cover w-full flex-grow-0"
            src={asset.gallery?.[0] || "/client.png"}
            alt="cover"
          />
          <h3 className="font-bold text-lg px-3 border-t border-t-black pt-3 h-full">
            {asset.title || asset.slug || asset.template?.slug}
          </h3>
        </Link>
        <nav className="flex justify-between pr-4 mt-auto">
          <p className="text-brand-gray px-3 py-2">${asset.price || 0} mxn</p>
          <CopyButton className="" text={publicLink} />
        </nav>
      </div>
    </main>
  );
};
