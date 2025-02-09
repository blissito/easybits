import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/utils/cn";
import { TbCloudUpload } from "react-icons/tb";
import { upload, type UploadCompletedData } from "~/.client/multipart/uploader";
import toast, { Toaster } from "react-hot-toast";
import { BsCloudCheckFill } from "react-icons/bs";
import { useSubmit } from "react-router";
// import { useUploadMultipart } from "~/borrame/useMultipartUpload";
import { useUploadMultipart } from "react-hook-multipart/react";

const UploadingItem = ({
  file,
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
  file: File;
}) => {
  const [progress, setProgress] = useState(0);
  const submit = useSubmit();
  const abortController = new AbortController();
  const previewURL = "/favicon.ico";

  const { upload } = useUploadMultipart({
    onUploadProgress({ percentage }) {
      setProgress(percentage);
    },
  });
  const handleUpload = () => {
    upload(file.name, file).then(({ key }) => {
      console.log("Object Uploaded:", key);
      submit({});
      setTimeout(onUploadComplete, 2000);
    });

    // SINGLE PUT URL: KEEP!
    // const putURL = await fetch("/get-put-url", { method: "POST" }).then((res) =>
    //   res.text()
    // );
    // console.log("La url: ", putURL);
    // const upload = await fetch(putURL, { method: "PUT", body: file });
    // console.log("Uploaded?", upload);
  };
  /** DEPRECATED */
  const __handleUpload = async () => {
    if (!file.size) return;
    let blob: UploadCompletedData;
    try {
      blob = await upload(file.name, file, {
        signal: abortController,
        multipart: true,
        access: "public-read",
        handleUploadUrl: "/api/upload",
        onUploadProgress: (progressEvent) => {
          setProgress(progressEvent.percentage);
        },
      });
      toast(
        () => (
          <p>
            Tu archivo ya se ha subido y está disponíble.
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
        { duration: 1000 }
      );
    } catch (error: unknown) {
      toast.error("La subida falló, por favor vuelve a intentar.");
      console.error(error);
    }
    // busy.current = false; EXPERIMENT
    setTimeout(onUploadComplete, 3000);
    submit({});
  };

  // @todo we can do better
  const busy = useRef<boolean>(false);
  useEffect(() => {
    if (busy.current) return;
    busy.current = true;
    handleUpload();
  }, [file]);

  return (
    <section className="flex items-center gap-4 py-2">
      <img src={previewURL} alt="preview" />
      <div className="flex-grow">
        <h3 className="truncate max-w-[200px]">{file.name}</h3>
        <p className="text-xs text-gray-500">
          {progress > 0 ? `${progress.toFixed(0)}%` : "preparando subida..."}
        </p>
        <ProgressBar progress={progress} />
      </div>
      <span
        className={cn("animate-pulse", {
          "text-green-500": progress > 99,
        })}
      >
        {progress > 99 ? <BsCloudCheckFill /> : <TbCloudUpload />}
      </span>
    </section>
  );
};

const ProgressBar = ({ progress = 4 }: { progress: number }) => {
  return (
    <div className="relative bg-zinc-300 w-full h-2 rounded-full">
      <div
        className={cn("inset-0 bg-blue-500 absolute rounded-full", {
          "bg-green-500": progress > 99,
        })}
        style={{
          width: `${progress}%`,
        }}
      ></div>
    </div>
  );
};

export const FileUploadProgress = ({
  onUploadComplete,
  files = [
    {
      name: "blissmo.mp4",
      size: 9 * 1024 * 1024,
      type: "video/quicktime",
    } as File,
  ],
}: {
  onUploadComplete?: (arg0: string) => void;
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
              <UploadingItem
                onUploadComplete={() => onUploadComplete?.(file.name)}
                key={i}
                file={file}
              />
            ))}
          </article>,
          portalNode
        )}
      <Toaster />
    </>
  );
};
