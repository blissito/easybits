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
        <button disabled className="text-xs text-brand-500 hidden md:block">
          Selecciona el archivo
        </button>
      </nav>
      {files.length > 0 && <Stacker files={files} />}
      {
        <Dropper
          mode={files.length > 0 ? "slim" : "default"}
          ref={ref}
          isHovered={isHovered}
        />
      }
    </article>
  );
};

const Stacker = ({ files }: { files: File[] }) => {
  return (
    <section>
      {files.map((file, i) => (
        <h1 key={i}>{file.name}</h1>
      ))}
    </section>
  );
};

const Dropper = ({
  ref,
  isHovered,
  mode = "default",
}: {
  mode?: "default" | "slim";
  isHovered?: string | null;
  ref: RefObject<HTMLButtonElement> | null;
}) => {
  return (
    <button
      ref={ref}
      className={cn(
        "items-center",
        "flex gap-4",
        "w-full",
        "border-2 border-dashed border-brand-gray rounded-2xl",
        {
          "border-black": isHovered === "hover",
          "border-brand-500": isHovered === "dropping",
          "h-[121px] justify-center p-4": mode === "default",
          "p-2 mt-2": mode === "slim",
        }
      )}
    >
      <img
        className={cn("w-10 aspect-square", {
          "w-6": mode === "slim",
        })}
        src="/icons/image-upload.svg"
        alt="upload illustration"
      />
      <p
        className={cn("max-w-md text-brand-gray", {
          "text-black": isHovered === "hover",
          "text-brand-500": isHovered === "dropping",
          "text-left text-xs": mode === "slim",
        })}
      >
        {mode === "default" ? (
          <>
            Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o
            sube hasta 50 archivos con un peso máximo de 1 TB en total.
          </>
        ) : mode === "slim" ? (
          <>Arrastra o selecciona más archivos</>
        ) : null}
      </p>
    </button>
  );
};
