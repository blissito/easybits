import type { File } from "@prisma/client";
import {

  FaMusic,
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
import { MdFolderZip } from "react-icons/md";
import { GiMagicLamp } from "react-icons/gi";

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

  return (
    <>
      <ConfirmModal
        fileName={fileToDelete?.name as string}
        isOpen={Boolean(fileToDelete)}
        onClose={closeConfirm}
        onConfirm={handleDelete}
      />

      <article className="bg-brand-100 border-[2px] rounded-xl border-black text-xs">
        <section className="grid grid-cols-12 pl-4 py-2 border-b-[2px] border-black">
          <span className=""></span>
          <span className="col-span-2 lg:col-span-4">Nombre</span>
          <span className="hidden md:block">Tamaño</span>
          <span className="col-span-2 md:col-span-1">Fecha</span>
          <span className="hidden md:block"></span>
          <span>Tipo</span>
          <span className="col-span-2  lg:col-span-1 ">Privacidad</span>
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
                "pl-4 bg-white",
                "hover:bg-gray-100 ",
                "grid grid-cols-12 items-center py-3 border-b",
                {
                  "rounded-b-xl": files.length - 1 === i,
                }
              )}
            >
              <span className="">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${file.name}`}
                  className="text-brand-500 border rounded border-black"
                />
              </span>
              <button
                onClick={() => {
                  onDetail?.(file);
                }}
                className="truncate font-semibold col-span-2 lg:col-span-4 text-left flex flex-col"
                title={file.name}
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
              <span className="hidden md:block"></span>
              <span className=" items-center flex">
                <IconRenderer
                  fileName={file.name}
                  type={file.contentType}
                  icons={{
                    video: <FaVideo />,
                    image: <FaRegImage />,
                    epub: <FaBook />,
                    pdf: <FaRegFilePdf />,
                    zip: <MdFolderZip />,
                    audio: <FaMusic />,
                    other: <GiMagicLamp />                    ,
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
              <span className="relative">
                {file.access === "private" ? (
                  <button
                    className="p-1 rounded-lg active:scale-95 hover:shadow active:shadow-inner bg-white"
                    onClick={() => onTokenClick?.(file)}
                  >
                    <img alt="icon" src="/icons/keys.svg" className="w-6" />
                  </button>
                ) : (
                  <Copy
                    mode="ghost"
                    className="inset-0 -top-4"
                    text={file.url}
                  />
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
