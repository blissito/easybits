import { Modal } from "../../common/Modal";
import { FilesForm } from "./FilesForm";
import { AnimatePresence } from "motion/react";
import { ActiveUploads } from "./Uploads";
import { useUploadManager } from "~/hooks/useUploadManager";

export const FilesFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  const { tasks, addFiles } = useUploadManager();
  const handleUploadStart = (fs: File[], access: "public-read" | "private") => {
    addFiles(fs, { access });
    onClose?.();
  };
  // when use animate presence, also place a key in children
  return (
    <AnimatePresence>
      <Modal
        key="selector"
        containerClassName="z-30"
        isOpen={isOpen}
        title={"Sube tus archivos"}
        onClose={onClose}
        block={false}
      >
        <FilesForm onClose={handleUploadStart} />
      </Modal>

      <Modal
        key="progress"
        block={false}
        isOpen={tasks.length > 0}
        title={<span className="text-xl">Subiendo...</span>}
        mode="naked"
        noCloseButton
      >
        <ActiveUploads tasks={tasks} />
      </Modal>
    </AnimatePresence>
  );
};
