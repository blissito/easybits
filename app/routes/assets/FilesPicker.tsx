import { useEffect, useRef, useState, type RefObject } from "react";
import { IoIosCloudUpload, IoMdCheckmark } from "react-icons/io";
import { useDropFiles } from "~/hooks/useDropFiles";
import { useUploadMultipart } from "react-hook-multipart/react";
import { cn } from "~/utils/cn";
import { MdOutlineCloudUpload } from "react-icons/md";
import type { Asset, File as AssetFile } from "@prisma/client";
import { FaCheckCircle } from "react-icons/fa";

export const FilesPicker = ({
  assetFiles = [],
  asset,
}: {
  assetFiles?: AssetFile[];
  asset: Asset;
}) => {
  const { isHovered, ref, files } = useDropFiles<HTMLButtonElement>();
  const unoUOtro = files.length > 0 || assetFiles.length > 0;
  return (
    <article>
      <h2 className="text-2xl">Archivos que se entregarán a los compradores</h2>
      <nav className="pt-3 pb-1 flex justify-between ">
        <p className="">Agrega los archivos del producto</p>
        <button disabled className="text-xs text-brand-500 hidden md:block">
          Selecciona el archivo
        </button>
      </nav>
      {unoUOtro && (
        <Stacker defaultFiles={assetFiles} assetId={asset.id} files={files} />
      )}
      {
        <Dropper
          mode={unoUOtro ? "slim" : "default"}
          ref={ref}
          isHovered={isHovered}
        />
      }
    </article>
  );
};

const Uploader = ({ file, assetId }: { file: File; assetId: string }) => {
  const [progress, setProgress] = useState(0);
  const { upload } = useUploadMultipart({
    onUploadProgress({ percentage }: { percentage: number }) {
      setProgress(percentage);
    },
  });

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // @todo start upload
      upload(file.name, file, undefined, { data: { assetId } });
    }
  }, []);
  return (
    <main className="border-2 border-dashed border-brand-gray rounded-xl px-2 py-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs truncate">{file.name}</span>
        <span
          className={cn("text-brand-500", {
            "text-brand-grass": progress >= 100,
            "animate-pulse": progress < 100,
          })}
        >
          {progress >= 100 ? <FaCheckCircle /> : <MdOutlineCloudUpload />}
        </span>
      </div>
      <div className="h-2 bg-black rounded-full overflow-hidden">
        <div
          className={cn(
            "bg-brand-500 h-full rounded-full border border-black",
            {
              "bg-brand-grass": progress >= 100,
            }
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </main>
  );
};

const FakeUploader = ({
  file,
  progress = 100,
}: {
  file: AssetFile;
  progress: number;
}) => {
  return (
    <main className="border-2 border-dashed border-brand-gray rounded-xl px-2 py-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs truncate">{file.name}</span>
        <span
          className={cn("text-brand-500", {
            "text-brand-grass": progress >= 100,
            "animate-pulse": progress < 100,
          })}
        >
          {progress >= 100 ? <FaCheckCircle /> : <MdOutlineCloudUpload />}
        </span>
      </div>
      <div className="h-2 bg-black rounded-full overflow-hidden">
        <div
          className={cn(
            "bg-brand-500 h-full rounded-full border border-black",
            {
              "bg-brand-grass": progress >= 100,
            }
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </main>
  );
};

const Stacker = ({
  defaultFiles = [],
  files,
  assetId,
}: {
  defaultFiles: AssetFile[];
  assetId: string;
  files: File[];
}) => {
  return (
    <section className="grid gap-2">
      {files.map((file, i) => (
        <Uploader assetId={assetId} key={i} file={file} />
      ))}
      {defaultFiles.map((assetFile, i) => (
        <FakeUploader file={assetFile} key={i} />
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
        "border-2 border-dashed border-brand-gray rounded-xl",
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
