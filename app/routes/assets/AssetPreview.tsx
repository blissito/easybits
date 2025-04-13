import type { Asset } from "@prisma/client";
import toast, { Toaster } from "react-hot-toast";
import { LuRefreshCcw } from "react-icons/lu";
import { useRef, useState } from "react";
import { EnrolledUsers } from "~/components/fullstack/EnrolledUsers";
import { MdContentCopy } from "react-icons/md";
import { IoShareSocialOutline } from "react-icons/io5";
import { Modal } from "~/components/common/Modal";
import { FaBoxOpen } from "react-icons/fa6";

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
  const [isOpen, setIsOpen] = useState(false);

  const handleModal = () => {
    setIsOpen(true);
    console.log("si sirce", isOpen);
  };
  return (
    <aside className="md:block hidden w-[40%] h-screen bg-black px-8 pt-6 pb-8 text-white sticky top-0">
      <Toaster />
      <nav className="flex items-center mb-8 gap-4">
        <h3 className="w-max text-xl mr-auto">Vista previa</h3>
        <button onClick={reloadIframe} className="text-xl active:text-gray-500">
          <LuRefreshCcw />
        </button>
        <button onClick={handleModal} isOpen={isOpen}>
          <IoShareSocialOutline className="text-2xl" />
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
          <MdContentCopy />
        </button>
        <EnrolledUsers assetId={asset.id} />
      </nav>
      <div className="bg-white h-[80%]">
        <iframe
          ref={iframeRef}
          // src={`https://${host}.easybits.cloud/${asset.slug}`}
          src={`https://${host}.easybits.cloud/p/${asset.slug}`} // should work locally?
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            zoom: 0.3,
          }}
          scrolling="no"
          frameBorder="0"
        ></iframe>
      </div>
    </aside>
  );
};

// const ShareLink = ({ isOpen }: { isOpen?: boolean }) => {
//   return (
//     <>
//       <Modal
//         key="selector"
//         containerClassName="z-50"
//         isOpen={isOpen}
//         title="Sube tus archivos"
//         // onClose={onClose}
//         block={false}
//       >
//         kkkkdssss
//       </Modal>
//     </>
//   );
// };
