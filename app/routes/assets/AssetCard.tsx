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
          "group-hover:-translate-x-2 group-hover:-translate-y-2", // brutalism
          "group max-w-[300px] grow bg-white rounded-xl border border-black overflow-hidden flex flex-col transition-all"
        )}
      >
        <Link to={`${asset.id}/edit`}>
          <img
            className="w-[300px] grow h-[252px] object-cover"
            src={asset.gallery?.[0] || "/public/hero/code.svg"}
            alt="cover"
          />
          <h3 className="font-bold text-lg px-3 border-t border-t-black pt-3">
            {asset.title || asset.slug || asset.template?.slug}
          </h3>
        </Link>
        <nav className="flex justify-between relative">
          <p className="text-brand-gray px-3 py-2">${asset.price || 0} mxn</p>
          <CopyButton text={publicLink} className="absolute right-3 bottom-4" />
        </nav>
      </div>
    </main>
  );
};
