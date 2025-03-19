import type { RefObject } from "react";
import { useDropFiles } from "~/hooks/useDropFiles";
import { cn } from "~/utils/cn";

export const FilesPicker = () => {
  const { isHovered, ref, files } = useDropFiles<HTMLButtonElement>();
  return (
    <article>
      <h2 className="text-2xl">Assets para enviar a los compradores</h2>
      <nav className="pt-3 pb-1 flex justify-between ">
        <p className="">Agrega los archivos del producto</p>
        <button className="text-xs text-brand-500 hidden md:block">
          Selecciona el archivo
        </button>
      </nav>
      {files.length < 1 && <Dropper ref={ref} isHovered={isHovered} />}
      {files.length > 0 && <Stacker files={files} />}
    </article>
  );
};

const Stacker = ({ files }: { files: File[] }) => {
  return (
    <section>
      <div>Perro</div>
    </section>
  );
};

const Dropper = ({
  ref,
  isHovered,
}: {
  isHovered?: string | null;
  ref: RefObject<HTMLButtonElement> | null;
}) => {
  return (
    <button
      ref={ref}
      className={cn(
        "justify-center",
        "flex items-center gap-4",
        "w-full h-[121px]",
        "border-2 border-dashed border-brand-gray rounded-2xl p-4",
        {
          "border-black": isHovered === "hover",
          "border-brand-500": isHovered === "dropping",
        }
      )}
    >
      <img
        className="w-10 aspect-square"
        src="/icons/image-upload.svg"
        alt="upload illustration"
      />
      <p
        className={cn("max-w-md text-brand-gray", {
          "text-black": isHovered === "hover",
          "text-brand-500": isHovered === "dropping",
        })}
      >
        Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o sube
        hasta 50 archivos con un peso máximo de 1 TB en total.
      </p>
    </button>
  );
};
