import { map } from "zod";
import { useDropFiles } from "~/hooks/useDropFiles";
import { useUploadMultipart } from "react-hook-multipart/react";
import { cn } from "~/utils/cn";
import { useEffect, useRef, useState } from "react";

export const FileInput = ({ assetId }: { assetId: string }) => {
  const { ref, files } = useDropFiles<HTMLButtonElement>();

  console.log("Files", files);

  return (
    <article>
      {files.map((file, i) => (
        <FileUploader assetId={assetId} file={file} key={i} />
      ))}
      <button
        ref={ref}
        type="button"
        className={cn(
          "py-4 pl-12 border-4 my-6 border-dashed rounded-3xl border-brand-500 flex items-center gap-6",
          "hover:scale-105 active:scale-100",
          "transition-all w-full"
        )}
      >
        <svg
          className="w-10 h-10 text-brand-500"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 20 18"
        >
          <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
        </svg>
        <p className="text-xl text-brand-500">Arrastra archivos o selecciona</p>
      </button>
    </article>
  );
};

export const FileUploader = ({
  file,
  assetId,
}: {
  assetId: string;
  file: File;
}) => {
  const isFirstRender = useRef<boolean>(true);
  const [progress, setProgress] = useState(0);
  const { upload } = useUploadMultipart({
    onUploadProgress({ percentage }: { percentage: number }) {
      setProgress(percentage.toFixed(0));
    },
  });
  useEffect(() => {
    if (!isFirstRender.current) return;

    upload(file.name, file, undefined, { data: { assetId } });
    isFirstRender.current = false;
  }, []);
  return (
    <section className="bg-white my-3 p-3 rounded-md border-black border-2 flex flex-col gap-2">
      <header className="flex justify-between">
        <h3 className="truncate text-xs">{file.name}</h3>
        <span className="text-xs">{progress}%</span>
      </header>
      <div className="h-4 w-full bg-gray-400/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500"
          style={{ maxWidth: `${progress}%` }}
        />
      </div>
    </section>
  );
};
