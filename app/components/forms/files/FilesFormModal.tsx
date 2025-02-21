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
    console.log("?? ora", fs);
    setFiles(fs); // @todo need to concat
    setAccess(privacy);
    setMode("naked");
    onClose?.();
  };

  const handleClose = () => {
    setFiles([]);
    onClose?.();
  };
  const handleFileComplete = (fileName: string) => {
    setFiles((fls) => fls.filter((fl) => fl.name !== fileName));
  };
  return (
    <>
      <AnimatePresence>
        <Modal
          containerClassName="z-30"
          isOpen={isOpen}
          title={"Sube tus archivos"}
          onClose={handleClose}
          block={false}
        >
          <FilesForm onClose={handleUploadStart} />
        </Modal>

        <Modal
          isOpen={files.length > 0}
          title={<span className="text-xl">Subiendo...</span>}
          mode={"naked"}
          noCloseButton
        >
          <ActiveUploads
            onFileComplete={handleFileComplete}
            access={access}
            files={files}
          />
        </Modal>
      </AnimatePresence>
    </>
  );
};
