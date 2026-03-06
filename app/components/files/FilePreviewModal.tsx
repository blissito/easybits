import { useEffect } from "react";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  FaRegImage,
  FaVideo,
  FaMusic,
  FaRegFilePdf,
  FaFile,
} from "react-icons/fa6";

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

  // Auto-fetch presigned URL when file changes
  useEffect(() => {
    if (file) {
      fetcher.submit(
        { intent: "preview", fileId: file.id },
        { method: "post" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (file) {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [file, onClose]);

  if (!file) return null;

  const previewUrl = fetcher.data?.previewUrl ?? null;
  const isLoading = fetcher.state !== "idle";

  const ct = file.contentType;
  const isImage = ct.startsWith("image/");
  const isVideo = ct.startsWith("video/");
  const isAudio = ct.startsWith("audio/");
  const isPdf = ct === "application/pdf";

  const renderPreview = (url: string) => {
    if (isImage) {
      return (
        <img
          src={url}
          alt={file.name}
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
          title={file.name}
          className="w-full h-[70vh] rounded-lg border-2 border-black"
        />
      );
    }
    return null;
  };

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white border-2 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b-2 border-black bg-brand-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg flex-shrink-0">{typeIcon}</span>
              <h3 className="font-bold text-sm truncate">{file.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-xl font-bold px-2 hover:bg-black hover:text-white rounded-lg transition-colors flex-shrink-0"
            >
              x
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
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
                <p className="text-sm font-bold text-gray-500">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400">
                  Preview no disponible para este tipo de archivo
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
