import type { Asset } from "@prisma/client";
import { useToaster } from "react-hot-toast";
import { FaBoxOpen, FaCopy, FaShare } from "react-icons/fa";
import toast, { Toaster } from "react-hot-toast";
import { LuRefreshCcw } from "react-icons/lu";
import { useRef } from "react";

export const AssetPreview = ({
  asset,
  host,
}: {
  host: string;
  asset: Asset;
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reloadIframe = () => {
    if (!iframeRef.current) return;

    iframeRef.current.src = iframeRef.current.src;
  };
  return (
    <aside className="h-screen bg-black p-8 text-white sticky top-0 w-[320px]">
      <Toaster />
      <nav className="flex items-center mb-8 gap-4">
        <h3 className="text-2xl mr-auto">Vista previa</h3>
        <button onClick={reloadIframe} className="text-xl active:text-gray-500">
          <LuRefreshCcw />
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(
              `https://${host}.easybits.cloud/p/${asset.slug}`
            );
            toast("Enlace copiado ✅", { position: "top-right" });
          }}
          className="text-xl"
        >
          <FaCopy />
        </button>
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
          ref={iframeRef}
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
