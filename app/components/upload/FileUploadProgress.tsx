import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/utils/cn";
import { TbCloudUpload } from "react-icons/tb";
import { upload } from "~/.client/multipart/uploader";
import toast, { Toaster } from "react-hot-toast";

export const FileUploadProgress = ({
  files = [
    {
      name: "blissmo.mp4",
      size: 9 * 1024 * 1024,
      type: "video/quicktime",
    } as File,
  ],
}: {
  files: File[];
}) => {
  // experiment
  if (!files) return null;

  //   const portalRef = useRef<HTMLElement>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement>();
  useEffect(() => {
    if (document.body) {
      setPortalNode(document.body);
    }
  }, []);
  //   const previewURL = URL.createObjectURL(file);
  return (
    <>
      {portalNode &&
        createPortal(
          <article
            className={cn(
              "fixed bottom-4 right-4 w-[320px] bg-zinc-100 text-black items-center",
              "px-4 rounded-xl"
            )}
          >
            {files.map((file, i) => (
              <UploadingItem key={i} file={file} />
            ))}
          </article>,
          portalNode
        )}
      <Toaster />
    </>
  );
};

const UploadingItem = ({ file }: { file: File }) => {
  const [progress, setProgress] = useState(4);

  const abortController = new AbortController();
  const previewURL = "/favicon.ico";

  const handleUpload = async () => {
    if (!file.size) return;

    const blob = await upload(file.name, file, {
      multipart: true,
      access: "public-read",
      handleUploadUrl: "/api/upload",
      onUploadProgress: (progressEvent) => {
        setProgress(progressEvent.percentage);
      },
    });

    console.log("BLOB", blob);

    toast(
      () => (
        <p>
          Tu archivo se ha subido y esta disponíble publicamente en:{" "}
          <a
            className="font-medium text-gray-900 underline"
            href={blob.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {blob.url}
          </a>
        </p>
      ),
      { duration: Number.POSITIVE_INFINITY }
    );
  };

  useEffect(() => {
    file.size && handleUpload();
  }, [file]);

  return (
    <section className="flex items-center gap-4 py-2">
      <img src={previewURL} alt="preview" />
      <div className="flex-grow">
        <h3 className="truncate max-w-[200px]">{file.name}</h3>
        <p className="text-xs text-gray-500">subiendo...</p>
        <ProgressBar progress={progress} />
      </div>
      <span className="animate-pulse">
        <TbCloudUpload />
      </span>
    </section>
  );
};

const ProgressBar = ({ progress = 4 }: { progress: number }) => {
  return (
    <div className="relative bg-zinc-300 w-full h-2 rounded-full">
      <div
        className="inset-0 bg-blue-500 absolute rounded-full"
        style={{
          width: `${progress}%`,
        }}
      ></div>
    </div>
  );
};
