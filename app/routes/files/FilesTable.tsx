import type { File } from "@prisma/client";
import {
  FaCat,
  FaChair,
  FaDog,
  FaHammer,
  FaRegFilePdf,
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
import { useStartVersioningFlyMachine } from "~/hooks/useStartVersioningFlyMachine";
import toast, { Toaster } from "react-hot-toast";
import Spinner from "~/components/common/Spinner";

const toMB = (bytes: number) => (bytes / 1000000).toFixed(2) + " mb";

export const FilesTable = ({
  files,
  onClick,
  onTokenClick,
  onDetail,
}: {
  onDetail?: (arg0: File) => void;
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
    setForceWorkingSpinner(fileToDelete.id);

    fetcher.submit(
      {
        intent: "delete_file",
      },
      {
        method: "post",
        action: `/api/v1/files?storageKey=${fileToDelete.storageKey}`,
      }
    );
  };

  const { requestHLS } = useStartVersioningFlyMachine();
  const [forceWorkingSpinner, setForceWorkingSpinner] = useState("");
  const handleHLS = async (file: File) => {
    setForceWorkingSpinner(file.id);
    toast.success("Procesando todas las versiones para: " + file.name, {
      position: "bottom-center",
      duration: 15000,
    });

    const machineInfo = await requestHLS(file.storageKey);
    console.log("INFO::", machineInfo);

    toast("Esto tomará algún tiempo, puedes olvidarte, yo me encargo. 🤖", {
      position: "bottom-center",
      icon: "⏲️",
      duration: 20000,
    });
  };

  return (
    <>
      <Toaster />
      <ConfirmModal
        fileName={fileToDelete?.name as string}
        isOpen={Boolean(fileToDelete)}
        onClose={closeConfirm}
        onConfirm={handleDelete}
      />

      <article className="bg-white border-[2px] rounded-xl border-black text-xs">
        <section className="grid grid-cols-12 pl-4 py-2 border-b-[2px] border-black">
          <span className=""></span>
          <span className="col-span-2">Nombre</span>
          <span className="hidden md:block">Tamaño</span>
          <span className="col-span-2 md:col-span-1">Fecha</span>
          {/* <span className="">Fuente</span> */}
          <span className="hidden md:block">Asset</span>
          <span>Tipo</span>
          <span className="col-span-2  lg:col-span-1 ">Privacidad</span>
          <span className="col-span-2 hidden lg:block">HLS</span>
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
                "grid grid-cols-12 items-start py-3 border-b",
                {
                  "rounded-b-xl": files.length - 1 === i,
                }
              )}
            >
              <span className="">
                <input
                  type="checkbox"
                  className="text-brand-500 border rounded focus:outline-brand-500 border-black"
                />
              </span>
              <button
                onClick={() => {
                  onDetail?.(file);
                }}
                className="truncate font-semibold col-span-2 text-left flex flex-col"
              >
                {file.name}
                <span className="text-brand-gray block md:hidden">
                  {toMB(file.size)}
                </span>
              </button>
              <span className="text-brand-gray hidden md:block">
                {toMB(file.size)}
              </span>
              <span className=" text-brand-gray col-span-2 md:col-span-1">
                {new Date(file.createdAt).toLocaleDateString("es-MX", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {/* <span className="text-brand-gray">Directa</span> */}
              <span className="text-brand-gray hidden md:block">---</span>
              <span className=" items-center flex">
                <IconRenderer
                  fileName={file.name}
                  type={file.contentType}
                  icons={{
                    video: <FaVideo />,
                    image: <FaRegImage />,
                    epub: <FaBook />,

                    pdf: <FaRegFilePdf />,
                    zip: <FaCat />,
                    audio: <FaHammer />,
                    other: <FaChair />,
                  }}
                />
              </span>
              <span className="col-span-2 lg:col-span-1 flex items-center">
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
              <span className="col-span-2  flex-wrap gap-px items-start hidden lg:flex">
                {file.contentType.includes("video") &&
                  file.versions?.length > 0 && (
                    <HLSVersions versions={file.versions} />
                  )}
                {(file.status === "WORKING" ||
                  forceWorkingSpinner === file.id) && <Spinner />}
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
                {file.contentType.includes("video") &&
                  file.versions?.length < 4 &&
                  file.status !== "WORKING" && (
                    <button
                      onClick={() => {
                        handleHLS(file);
                      }}
                      className="p-3 rounded-lg hover:bg-gray-100 text-xs  transition-all w-full"
                    >
                      Generar HLS
                    </button>
                  )}
                {file.status === "DONE" && file.masterPlaylistURL && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(file.masterPlaylistURL!);
                    }}
                    className="p-3 rounded-lg hover:bg-gray-100 text-xs  transition-all w-full"
                  >
                    copiar HLS playlist
                  </button>
                )}
                {file.status !== "WORKING" && (
                  <button
                    onClick={() => openConfirm(file)}
                    className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-red transition-all"
                  >
                    Eliminar
                  </button>
                )}
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
