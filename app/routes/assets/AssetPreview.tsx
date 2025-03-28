import type { Asset } from "@prisma/client";
import { FaBoxOpen, FaCopy, FaShare } from "react-icons/fa";

export const AssetPreview = ({ asset, host }: { asset: Asset }) => {
  return (
    <aside className="h-screen bg-black p-8 text-white sticky top-0 w-[320px]">
      <nav className="flex items-center mb-8 gap-4">
        <h3 className="text-2xl mr-auto">Vista previa</h3>
        <span className="text-xl">
          <FaShare />
        </span>
        <span className="text-xl">
          <FaCopy />
        </span>
        <span className="text-xl">
          <FaBoxOpen />
        </span>
      </nav>
      {/* <img
        className="rounded-2xl"
        src="/hero/example1.png"
        alt="template preview"
      /> */}
      <div className="bg-white h-[80%]">
        <iframe
          // src={`https://${host}.easybits.cloud/${asset.slug}`}
          src={`https://${host}.easybits.cloud/p/${asset.slug}`} // should work locally?
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            zoom: 0.5,
          }}
          scrolling="no"
          frameBorder="0"
        ></iframe>
      </div>
    </aside>
  );
};
