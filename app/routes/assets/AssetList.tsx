import type { Asset } from "@prisma/client";
import { AssetCard } from "./AssetCard";

export const AssetList = ({ assets }: { assets?: Asset[] }) => {
  return (
    <article className="relative  ">
      <section className="flex flex-wrap gap-8 w-full">
        {assets?.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
};
