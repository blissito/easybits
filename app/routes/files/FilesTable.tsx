import type { File } from "@prisma/client";
import {
  FaCat,
  FaChair,
  FaDog,
  FaHammer,
  FaRegImage,
  FaVideo,
} from "react-icons/fa";
import { BrutalButton } from "~/components/common/BrutalButton";
import { DotsMenu } from "./DotsMenu";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { Copy } from "~/components/common/Copy";
import { IconRenderer } from "./IconRenderer";
import { FaBook } from "react-icons/fa6";
import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";

const toMB = (bytes: number) => (bytes / 1000000).toFixed(2) + " mb";

export const FilesTable = ({
  files,
  onClick,
  onTokenClick,
}: {
  onTokenClick?: (arg0: File) => void;
  onClick?: () => void;
  files: File[];
}) => {
  const fetcher = useFetcher();
  const [fileToDelete, setFileToDelete] = useState<File | null>(null);

  const handleDownload = (file: File) => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.url;
    a.click();
  };

  const openConfirm = (f: File) => {
    setFileToDelete(f);
  };

  const closeConfirm = () => {
    setFileToDelete(null);
  };

  const handleDelete = () => {
    if (!fileToDelete) return;

    fetcher.submit(
      {
        intent: "delete_file",
        id: fileToDelete.id,
        storageKey: fileToDelete.storageKey,
      },
      { method: "post", action: "/api/v1/files" }
    );
  };

  const handleHLS = async (file: File) => {
    const r = await fetch("https://video-converter-hono.fly.dev/start", {
      method: "post",
      headers: {
        "content-type": "application/json",
        "user-agent": "blissmo/10.11",
        authorization: "Bearer PerroTOken",
      },
      body: JSON.stringify({
        storageKey: file.storageKey,
        Bucket: "easybits-dev",
        sizeName: "360p",
        webhook: "https://easybits.cloud/api/v1/conversion_webhook",
      }),
    });
    console.log("RESPONSE: ", r.ok, r.statusText);
  };

  return (
    <>
      <ConfirmModal
        fileName={fileToDelete?.name as string}
        isOpen={Boolean(fileToDelete)}
        onClose={closeConfirm}
        onConfirm={handleDelete}
      />
      <BrutalButton onClick={onClick} containerClassName="block ml-auto mb-8">
        + Subir archivo
      </BrutalButton>
      <article className="bg-white border-2 rounded-xl border-black text-xs">
        <section className="grid grid-cols-12 pl-4 py-2 border-b border-black">
          <span className=""></span>
          <span className="col-span-2">Nombre</span>
          <span className="">Tamaño</span>
          <span>Fecha</span>
          {/* <span className="">Fuente</span> */}
          <span>Asset</span>
          <span className="">Tipo</span>
          <span className="col-span-2">Privacidad</span>
          <span className="col-span-1">HLS</span>
          <span className="">Link</span>
          <span className=""></span>
        </section>

        <AnimatePresence>
          {files.map((file, i) => (
            <motion.section
              layout
              initial={{ x: 10, opacity: 0 }}
              exit={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              key={file.id}
              className={cn(
                "pl-4",
                "hover:bg-gray-100 ",
                "grid grid-cols-12 py-3 border-b",
                {
                  "rounded-b-xl": files.length - 1 === i,
                }
              )}
            >
              <span className="">
                <input
                  type="checkbox"
                  className="text-brand-500 focus:outline-brand-500"
                />
              </span>
              <span className="truncate font-semibold col-span-2">
                {file.name}
              </span>
              <span className="text-brand-gray">{toMB(file.size)}</span>
              <span className=" text-brand-gray">
                {new Date(file.createdAt).toLocaleDateString("es-MX", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {/* <span className="text-brand-gray">Directa</span> */}
              <span className="text-brand-gray">---</span>
              <span className="flex items-center">
                <IconRenderer
                  fileName={file.name}
                  type={file.contentType}
                  icons={{
                    video: <FaVideo />,
                    image: <FaRegImage />,
                    epub: <FaBook />,

                    pdf: <FaDog />,
                    zip: <FaCat />,
                    audio: <FaHammer />,
                    other: <FaChair />,
                  }}
                />
              </span>
              <span className="col-span-1 flex items-center">
                {file.access === "private" ? (
                  <span className="bg-brand-aqua rounded-full py-px px-1 border border-black">
                    Privado
                  </span>
                ) : (
                  <span className="bg-brand-yellow rounded-full py-px px-1 border border-black">
                    Público
                  </span>
                )}
              </span>
              <span className="col-span-2 flex flex-wrap gap-px items-start">
                {file.contentType.includes("video") &&
                  file.masterPlaylistContent && (
                    <>
                      <HLSVersions versions={file.versions} />
                      {/* <video
                        className="aspect-video min-w-[600px]"
                        controls
                        // @todo save the real master file
                        src={`/api/v1/${file.id}/main.m3u8`}
                      /> */}
                    </>
                  )}
              </span>
              <span className="relative">
                {file.access === "private" ? (
                  <button
                    className="p-1 rounded-lg active:scale-95 hover:shadow active:shadow-inner bg-white"
                    onClick={() => onTokenClick?.(file)}
                  >
                    <img alt="icon" src="/icons/keys.svg" className="w-6" />
                  </button>
                ) : (
                  <Copy mode="ghost" className="inset-0" text={file.url} />
                )}
              </span>
              <DotsMenu>
                {file.access !== "private" && (
                  <button
                    onClick={() => {
                      handleDownload(file);
                    }}
                    className="p-3 rounded-lg hover:bg-gray-100 text-xs  transition-all w-full"
                  >
                    Descargar
                  </button>
                )}
                {file.contentType.includes("video") && (
                  <button
                    onClick={() => {
                      handleHLS(file);
                    }}
                    className="p-3 rounded-lg hover:bg-gray-100 text-xs  transition-all w-full"
                  >
                    Generar HLS
                  </button>
                )}
                <button
                  onClick={() => openConfirm(file)}
                  className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-red transition-all"
                >
                  Eliminar
                </button>
              </DotsMenu>
            </motion.section>
          ))}
        </AnimatePresence>
      </article>
    </>
  );
};

export const HLSVersions = ({ versions }: { versions: string[] }) => {
  return (
    <>
      {versions.includes("360p") && (
        <span className="py-px px-2 bg-pink-300 rounded-full border border-black">
          360p
        </span>
      )}
      {versions.includes("480p") && (
        <span className="py-px px-2 bg-zinc-300 rounded-full border border-black">
          480p
        </span>
      )}
      {versions.includes("720p") && (
        <span className="py-px px-2 bg-orange-300 rounded-full border border-black">
          720p
        </span>
      )}
      {versions.includes("1080p") && (
        <span className="py-px px-2 bg-blue-300 rounded-full border border-black">
          1080p
        </span>
      )}
    </>
  );
};
