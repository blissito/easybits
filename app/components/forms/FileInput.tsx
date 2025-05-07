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
  isCustom,
}: {
  actionId?: string;
  files?: (AssetFile | File)[];
  assetId: string;
  placeholder: string;
  isCustom: boolean;
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
            match ? toast("Un archivo ya existe") : undefined;
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
          "py-4 pl-12 border-4 my-6 border-dashed rounded-xl border-brand-500 flex items-center justify-center gap-6",
          "hover:scale-[1.01] active:scale-100",
          "transition-all w-full",
          { "flex-col p-0 py-4 min-h-[150px] border-black border-2": isCustom }
        )}
      >
        <svg
          className={cn("w-10 h-10 text-brand-500", {
            "text-black": isCustom,
          })}
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 20 18"
        >
          <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
        </svg>
        <p
          className={cn("text-brand-500 px-4 text-md", {
            "text-black": isCustom,
          })}
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
