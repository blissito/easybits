import type { Asset } from "@prisma/client";
import { AssetCard } from "./AssetCard";

export const AssetList = ({ assets }: { assets?: Asset[] }) => {
  return (
    <article className="relative z-10">
      <section className="flex flex-wrap gap-8">
        {assets?.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
};
