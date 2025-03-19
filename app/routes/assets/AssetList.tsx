import type { Asset } from "@prisma/client";
import { AssetCard } from "./AssetCard";

export const AssetList = ({ assets }: { assets?: Asset[] }) => {
  return (
    <article className="relative  ">
      <section className="md:grid-cols-4 sm:grid-cols-2 grid gap-8">
        {assets?.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
};
