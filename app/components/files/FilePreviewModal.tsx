import { useEffect } from "react";
import { useFetcher } from "react-router";
import {
  FaRegImage,
  FaVideo,
  FaMusic,
  FaRegFilePdf,
  FaFile,
} from "react-icons/fa6";
import { Modal } from "~/components/common/Modal";

type PreviewFile = {
  id: string;
  name: string;
  contentType: string;
  access: string;
  url: string | null;
  storageKey: string;
};

export function FilePreviewModal({
  file,
  onClose,
}: {
  file: PreviewFile | null;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ previewUrl: string }>();

  useEffect(() => {
    if (file) {
      fetcher.submit(
        { intent: "preview", fileId: file.id },
        { method: "post" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  const previewUrl = fetcher.data?.previewUrl ?? null;
  const isLoading = fetcher.state !== "idle";

  const ct = file?.contentType ?? "";
  const isImage = ct.startsWith("image/");
  const isVideo = ct.startsWith("video/");
  const isAudio = ct.startsWith("audio/");
  const isPdf = ct === "application/pdf";
  const canPreview = isImage || isVideo || isAudio || isPdf;

  const typeIcon = isImage ? (
    <FaRegImage />
  ) : isVideo ? (
    <FaVideo />
  ) : isAudio ? (
    <FaMusic />
  ) : isPdf ? (
    <FaRegFilePdf />
  ) : (
    <FaFile />
  );

  const renderPreview = (url: string) => {
    if (isImage) {
      return (
        <img
          src={url}
          alt={file!.name}
          className="max-h-[70vh] w-auto mx-auto object-contain rounded-lg"
        />
      );
    }
    if (isVideo) {
      return (
        <video
          controls
          src={url}
          className="max-h-[70vh] w-full rounded-lg"
        />
      );
    }
    if (isAudio) {
      return (
        <div className="flex flex-col items-center gap-6 py-8">
          <FaMusic className="text-6xl text-brand-500" />
          <audio controls src={url} className="w-full max-w-md" />
        </div>
      );
    }
    if (isPdf) {
      return (
        <iframe
          src={url}
          title={file!.name}
          className="w-full h-[85vh] rounded-lg border-2 border-black"
        />
      );
    }
    return null;
  };

  return (
    <Modal
      isOpen={Boolean(file)}
      onClose={onClose}
      title={
        file ? (
          <span className="flex items-center gap-2">
            <span className="text-lg flex-shrink-0">{typeIcon}</span>
            <span className="truncate text-sm font-bold" title={file.name}>{file.name}</span>
          </span>
        ) : undefined
      }
      className={`min-h-0 w-full ${isPdf ? "max-w-6xl" : "max-w-3xl"}`}
    >
      {file && (
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <span className="text-4xl animate-pulse">{typeIcon}</span>
              <p className="text-sm text-gray-500 font-medium">Cargando preview...</p>
            </div>
          ) : canPreview && previewUrl ? (
            renderPreview(previewUrl)
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <span className="text-4xl">{typeIcon}</span>
              <p className="text-sm font-bold text-gray-500">{file.name}</p>
              <p className="text-xs text-gray-400">
                Preview no disponible para este tipo de archivo
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
