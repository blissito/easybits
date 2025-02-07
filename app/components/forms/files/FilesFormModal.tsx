import { useState } from "react";
import { Modal } from "../../common/Modal";
import { FilesForm } from "./FilesForm";
import { AnimatePresence } from "motion/react";
import { ActiveUploads } from "./Uploads";

export const FilesFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  const [mode, setMode] = useState<"overlay" | "naked">("overlay");
  const [access, setAccess] = useState<"public-read" | "private">(
    "public-read"
  );
  const [files, setFiles] = useState<File[]>([
    // { name: "perro.svg", size: 98987 },
  ]);
  const handleUploadStart = (
    fs: File[],
    privacy: "public-read" | "private"
  ) => {
    setFiles(fs);
    setAccess(privacy);
    setMode("naked");
  };

  const handleClose = () => {
    setFiles([]);
    onClose?.();
  };

  // @todo why not upload while uploading? XD
  const isUploading = files.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      title={
        isUploading ? (
          <span className="text-xl">Subiendo...</span>
        ) : (
          "Sube tus archivos"
        )
      }
      onClose={mode === "naked" ? undefined : handleClose}
      mode={mode}
      noCloseButton={mode === "naked"}
    >
      <AnimatePresence>
        {files.length < 1 && <FilesForm onClose={handleUploadStart} />}
        {files.length > 0 && <ActiveUploads access={access} files={files} />}
      </AnimatePresence>
    </Modal>
  );
};
