import type { File } from "@prisma/client";
import {
  FaCat,
  FaChair,
  FaDog,
  FaHammer,
  FaHamsa,
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
import { FaBook, FaBookAtlas } from "react-icons/fa6";
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
    console.log("OPEN?", f);
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
          <span className="col-span-3">Nombre</span>
          <span className="">Tamaño</span>
          <span>Fecha</span>
          {/* <span className="">Fuente</span> */}
          <span>Asset</span>
          <span className="">Tipo</span>
          <span className="col-span-2">Privacidad</span>
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
              <span className="truncate font-semibold col-span-3">
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
              <span className="col-span-2 flex items-center">
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
                    onClick={() => onTokenClick(file)}
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
