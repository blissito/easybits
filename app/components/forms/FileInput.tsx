import { map } from "zod";
import { useDropFiles } from "~/hooks/useDropFiles";
import { useUploadMultipart } from "react-hook-multipart/react";
import { cn } from "~/utils/cn";
import { useEffect, useRef, useState } from "react";
import type { File as AssetFile } from "@prisma/client";
import { PiFileDashedDuotone } from "react-icons/pi";
import { IoTrashBinOutline } from "react-icons/io5";
import { useFetcher } from "react-router";
import Spinner from "../common/Spinner";
import toast from "react-hot-toast";

export const FileInput = ({
  files: assetFiles = [],
  assetId,
  actionId,
  placeholder,
  placeholderClassName,
  buttonClassName,
  svgClassName,
}: {
  actionId?: string;
  files?: (AssetFile | File)[];
  assetId: string;
  placeholder?: string;
  placeholderClassName?: string;
  svgClassName?: string;
  buttonClassName?: string;
}) => {
  const { ref, files, removeFile } = useDropFiles<HTMLButtonElement>();
  const filtered = assetFiles.filter((af) => af.actionId === actionId);

  return (
    <article>
      {filtered.map((file, i) => (
        <FileUploader progress={100} assetId={assetId} file={file} key={i} />
      ))}
      {files
        .filter((f, i) => {
          let notFound = true;
          filtered.forEach((af) => {
            const match = f.name === af.metadata.name;
            match ? (notFound = false) : undefined;
            match ? removeFile(i) : undefined;
            match
              ? toast.error("Un archivo ya existe", {
                  style: {
                    border: "2px solid #000000",
                    padding: "16px",
                    color: "#000000",
                  },
                })
              : undefined;
          });
          return notFound;
        })
        .map((file, i) => (
          <FileUploader
            actionId={actionId}
            assetId={assetId}
            file={file}
            key={i}
          />
        ))}
      <button
        ref={ref}
        type="button"
        className={cn(
          "py-4 pl-12 border-iron border my-6 border-dashed rounded-xl flex items-center justify-center gap-6",
          "hover:scale-[0.95] active:scale-100",
          "transition-all w-full",
          buttonClassName
        )}
      >
        <img className="w-8 h-8" src="/icons/image-upload.svg" alt="Subir imagen" />
        <p
          className={cn(
            "hover:text-brand-500 px-4 text-sm text-marengo",
            placeholderClassName
          )}
        >
          {placeholder || "Arrastra archivos o selecciona"}
        </p>
      </button>
    </article>
  );
};

export const FileUploader = ({
  file,
  assetId,
  progress: outsideProgress = 0,
  actionId,
  onCancel,
}: {
  onCancel?: () => void;
  progress?: number;
  assetId: string;
  actionId?: string;
  file: File | AssetFile;
}) => {
  const isFirstRender = useRef<boolean>(!file.id);
  const [progress, setProgress] = useState(outsideProgress);
  const { upload } = useUploadMultipart({
    onUploadProgress({ percentage }: { percentage: number }) {
      setProgress(percentage.toFixed(0));
    },
  });
  useEffect(() => {
    if (!isFirstRender.current) return;

    if (file.id) {
      return;
    } else {
      upload(file.name, file, undefined, { data: { assetId, actionId } });
    }
    isFirstRender.current = false;
  }, []);

  const [isHovered, setHovered] = useState(false);
  const handleMouseEnter = () => {
    setHovered(true);
  };
  const handleMouseLeave = () => {
    setHovered(false);
  };

  const fetcher = useFetcher();
  const handleCancel = async () => {
    const isDelete = progress >= 100;
    console.log("About to::", isDelete ? "delete" : "cancel");
    if (isDelete) {
      await fetcher.submit(
        {
          intent: "delete_file",
          storageKey: (file as AssetFile).storageKey,
        },
        { method: "post", action: "/api/v1/files" }
      );
    }
  };
  const isLoading = fetcher.state !== "idle";
  return (
    <article className="bg-white my-3 p-3 rounded-md border-black border-2 flex flex-col gap-2">
      <header
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex justify-between items-center"
      >
        <h3 className="truncate text-xs">{file.name}</h3>
        <button
          disabled={fetcher.state !== "idle"}
          onClick={handleCancel}
          type="button"
          className={cn("p-2", "active:scale-[0.96]", "", {
            "text-red-500": isHovered,
          })}
        >
          {!isLoading &&
            progress >= 100 &&
            (isHovered ? <IoTrashBinOutline /> : <PiFileDashedDuotone />)}
          {!isLoading && progress < 100 && (
            <p className="p-2 text-xs">{progress}%</p>
          )}
          {isLoading && <Spinner />}
        </button>
      </header>
      <section
        className={cn(
          "border-2 border-black",
          "h-4 w-full bg-gray-400/20 rounded-full overflow-hidden"
        )}
      >
        <main
          className={cn("", "h-full bg-brand-500", {
            "bg-green-500/40": progress >= 100,
          })}
          style={{ maxWidth: `${progress}%` }}
        />
      </section>
    </article>
  );
};
