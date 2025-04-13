import type { Asset } from "@prisma/client";
import { AssetCard } from "./AssetCard";

export const AssetList = ({ assets }: { assets?: Asset[] }) => {
  return (
    <article className="relative  ">
      <section className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4 grid gap-8">
        {assets?.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
};
