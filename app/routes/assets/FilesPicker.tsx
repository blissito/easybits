import { useEffect, useRef, useState, type RefObject } from "react";
import {
  IoIosCloudUpload,
  IoMdCheckmark,
  IoMdRemoveCircle,
} from "react-icons/io";
import { useDropFiles } from "~/hooks/useDropFiles";
import { useUploadMultipart } from "react-hook-multipart/react";
import { cn } from "~/utils/cn";
import { MdOutlineCloudUpload } from "react-icons/md";
import type { Asset, File as AssetFile } from "@prisma/client";
import { FaCheckCircle } from "react-icons/fa";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { motion } from "motion/react";
import { useEndpoint } from "~/hooks/useEndpoint";
import { ImageIcon } from "~/components/icons/image";
import { useUploads } from "~/context";

export const FilesPicker = ({
  assetFiles = [],
  asset,
}: {
  assetFiles?: AssetFile[];
  asset: Asset;
}) => {
  const { isHovered, ref, files, removeFile } =
    useDropFiles<HTMLButtonElement>();
  const { uploads, uploadFile, cancelUpload, retryUpload, clearUpload } =
    useUploads();

  // Lanzar subidas cuando se agregan archivos nuevos
  useEffect(() => {
    files.forEach((file) => {
      // Si el archivo no está ya en uploads, lo subimos
      if (!uploads.some((u) => u.file === file)) {
        uploadFile(file, asset.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, asset.id]);

  const unoUOtro = files.length > 0 || assetFiles.length > 0;
  return (
    <article>
      <h2 className="text-2xl font-bold">Archivos de tu asset</h2>
      <nav className="pt-3 pb-1 flex justify-between ">
        <p className="">
          Agrega los archivos que entregaremos a tus clientes compra
        </p>
        <button disabled className="text-xs text-brand-500 hidden md:block">
          Selecciona el archivo
        </button>
      </nav>
      {unoUOtro && (
        <Stacker
          removeFile={removeFile}
          defaultFiles={assetFiles}
          assetId={asset.id}
          files={files}
          uploads={uploads}
          cancelUpload={cancelUpload}
          retryUpload={retryUpload}
          clearUpload={clearUpload}
        />
      )}
      {
        <Dropper
          mode={unoUOtro ? "slim" : "default"}
          ref={ref as RefObject<HTMLButtonElement>}
          isHovered={isHovered}
        />
      }
    </article>
  );
};

const Uploader = ({
  onUpload,
  file,
  assetId,
}: {
  onUpload?: () => void;
  file: File;
  assetId: string;
}) => {
  const [progress, setProgress] = useState(0);
  //   const submit = useSubmit();
  const { upload } = useUploadMultipart({
    onUploadProgress({ percentage }: { percentage: number }) {
      setProgress(percentage);
      if (percentage >= 100) {
        // submit({});
        // location.reload();
        onUpload?.();
      }
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
    <motion.main
      layoutId={file.name}
      key={file.name}
      initial={{
        opacity: 0,
        y: 10,
      }}
      exit={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="border-2 border-dashed border-brand-gray rounded-xl px-2 py-2"
    >
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
    </motion.main>
  );
};

const FakeUploader = ({
  file,
  progress = 100,
  index,
}: {
  file: AssetFile;
  progress?: number;
  index: number;
}) => {
  const { remove } = useEndpoint("/api/v1/files");

  const deleteAssrtFile = () => {
    remove({
      intent: "delete_file",
      storageKey: file.storageKey,
    });
  };

  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.main
      layoutId={file.name}
      key={file.id}
      transition={{ delay: index * 0.1 }}
      initial={{
        opacity: 0,
        y: 10,
      }}
      exit={{
        opacity: 0,
        x: -10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="border-2 border-dashed border-brand-gray rounded-xl px-2 py-2"
    >
      <div
        onMouseLeave={() => setIsHovered(false)}
        className="flex justify-between mb-1"
      >
        <span className="text-xs truncate">{file.name}</span>
        <button
          onClick={deleteAssrtFile}
          onMouseEnter={() => setIsHovered(true)}
          className={cn("text-brand-500", {
            "text-brand-grass": progress >= 100,
            "animate-pulse": progress < 100,
            "text-red-500": isHovered,
          })}
        >
          {isHovered ? <IoMdRemoveCircle /> : <FaCheckCircle />}
        </button>
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
    </motion.main>
  );
};

const Stacker = ({
  defaultFiles = [],
  files,
  assetId,
  removeFile,
  uploads,
  cancelUpload,
  retryUpload,
  clearUpload,
}: {
  removeFile?: (i: number) => void;
  defaultFiles: AssetFile[];
  assetId: string;
  files: File[];
  uploads: any[];
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearUpload: (id: string) => void;
}) => {
  return (
    <section className="grid gap-2">
      <AnimatePresence>
        {/* Mostrar subidas activas (uploads) */}
        {uploads
          .filter((u) => u.assetId === assetId)
          .map((u) => (
            <motion.main
              layoutId={u.file.name}
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              exit={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "bg-white",
                "border-2 border-dashed border-brand-gray rounded-xl px-2 py-2"
              )}
            >
              <div className="flex justify-between mb-1">
                <span className="text-xs truncate">{u.file.name}</span>
                <span
                  className={cn("text-brand-500", {
                    "text-brand-grass": u.progress >= 100,
                    "animate-pulse": u.progress < 100,
                  })}
                >
                  {u.status === "success" ? (
                    <FaCheckCircle />
                  ) : (
                    <MdOutlineCloudUpload />
                  )}
                </span>
              </div>
              <div className="h-2 bg-black rounded-full overflow-hidden">
                <div
                  className={cn(
                    "bg-brand-500 h-full rounded-full border border-black",
                    {
                      "bg-brand-grass": u.progress >= 100,
                    }
                  )}
                  style={{ width: `${u.progress}%` }}
                />
              </div>
              <div className="flex gap-2 mt-2">
                {u.status === "uploading" && (
                  <button
                    className="text-xs text-red-500"
                    onClick={() => cancelUpload(u.id)}
                  >
                    Cancelar
                  </button>
                )}
                {u.status === "error" && (
                  <button
                    className="text-xs text-yellow-600"
                    onClick={() => retryUpload(u.id)}
                  >
                    Reintentar
                  </button>
                )}
                {["success", "error", "cancelled"].includes(u.status) && (
                  <button
                    className="text-xs text-gray-500"
                    onClick={() => clearUpload(u.id)}
                  >
                    Quitar
                  </button>
                )}
                {u.status === "error" && (
                  <span className="text-xs text-red-500">Error</span>
                )}
                {u.status === "cancelled" && (
                  <span className="text-xs text-gray-500">Cancelado</span>
                )}
              </div>
            </motion.main>
          ))}
        {/* Mostrar archivos ya subidos (defaultFiles) */}
        {defaultFiles.map((assetFile, i) => (
          <FakeUploader index={i} file={assetFile} key={assetFile.id} />
        ))}
      </AnimatePresence>
    </section>
  );
};

export { Stacker };

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
        "items-center mt-1",
        "flex gap-4",
        "w-full",
        "border-[1px] border-dashed border-black hover:border-brand-500 rounded-xl",
        {
          "border-iron": isHovered === "hover",
          "border-brand-500": isHovered === "dropping",
          "h-[121px] justify-center p-4": mode === "default",
          "p-2 mt-2": mode === "slim",
        }
      )}
    >
      <ImageIcon className="w-8 h-" fill={isHovered ? "#9870ED" : " #6A6966"} />

      <p
        className={cn("max-w-md text-brand-gray text-sm text-left", {
          "text-brand-500": isHovered === "hover",
          "text-left text-xs": mode === "slim",
        })}
      >
        {mode === "default" ? (
          <>
            Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o
            sube hasta 50 archivos con un peso máximo de 250 mb en total.
          </>
        ) : mode === "slim" ? (
          <>Arrastra o selecciona más archivos</>
        ) : null}
      </p>
    </button>
  );
};
