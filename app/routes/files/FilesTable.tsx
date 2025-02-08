import type { File } from "@prisma/client";
import { BsThreeDotsVertical } from "react-icons/bs";
import { FaVideo } from "react-icons/fa";
import { BrutalButton } from "~/components/common/BrutalButton";
import { CopyButton } from "~/components/common/CopyButton";

const toMB = (bytes: number) => (bytes / 1000000).toFixed(2) + " mb";

export const FilesTable = ({
  files,
  onClick,
}: {
  onClick?: () => void;
  files: File[];
}) => {
  return (
    <>
      <BrutalButton onClick={onClick} containerClassName="block ml-auto mb-8">
        + Subir archivo
      </BrutalButton>
      <article className="border-2 rounded-xl border-black text-xs">
        <section className="grid grid-cols-12 pl-12 py-2 border-b border-black">
          <span className=""></span>
          <span className="">Nombre</span>
          <span className="">Tamaño</span>
          <span className="col-span-2">Fecha de creación</span>
          <span className="">Fuente</span>
          <span className="col-span-2">Asset relacionado</span>
          <span className="">Tipo</span>
          <span className="">Privacidad</span>
          <span className="">Link</span>
          <span className=""></span>
        </section>

        {files.map((file) => (
          <section
            key={file.id}
            className="grid grid-cols-12 pl-12 py-3 border-b"
          >
            <span className="">
              <input type="checkbox" />
            </span>
            <span className="truncate font-semibold">{file.name}</span>
            <span className="text-brand-gray">{toMB(file.size)}</span>
            <span className="col-span-2 text-brand-gray">
              {new Date(file.createdAt).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="text-brand-gray">Directa</span>
            <span className="col-span-2 text-brand-gray">---</span>
            <span className="border border-black w-6 h-6 grid place-content-center rounded-full">
              <FaVideo />
            </span>
            <span className="">
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
            <span>
              <CopyButton className="text-xs" />
            </span>
            <button className="text-lg active:scale-95">
              <BsThreeDotsVertical />
            </button>
          </section>
        ))}
      </article>
    </>
  );
};
