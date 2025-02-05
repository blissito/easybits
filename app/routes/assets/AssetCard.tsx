import type { Asset } from "@prisma/client";
import { CopyButton } from "~/components/common/CopyButton";
import { cn } from "~/utils/cn";

export const AssetCard = ({ asset }: { asset: Asset }) => {
  const origin = "http://localhost:3000"; // @todo get from server?
  return (
    <main className="group bg-black inline-block rounded-2xl">
      <div
        className={cn(
          "group-hover:-translate-x-2 group-hover:-translate-y-2", // brutalism
          "group w-[326px] bg-white rounded-2xl border border-black overflow-hidden flex flex-col transition-all"
        )}
      >
        <img
          className="max-w-[326px] h-[252px] object-cover"
          src={asset.image || "/hero/hero-img.png"}
          alt="cover"
        />
        <h3 className="font-bold text-lg px-3 border-t border-t-black pt-3">
          {asset.title || asset.slug || asset.metadata?.name}
        </h3>
        <nav className="flex justify-between relative">
          <p className="text-brand-gray px-3 py-2">${asset.price || 0} mxn</p>
          <CopyButton
            text={`${origin}/${asset.slug}`}
            className="absolute right-3 bottom-4"
          />
        </nav>
      </div>
    </main>
  );
};
