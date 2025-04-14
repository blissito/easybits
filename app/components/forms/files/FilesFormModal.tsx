import { Modal } from "../../common/Modal";
import { FilesForm } from "./FilesForm";
import { AnimatePresence } from "motion/react";
import { ActiveUploads } from "./Uploads";
import { useUploadManager } from "~/hooks/useUploadManager";
import { useSubmit } from "react-router";

export const FilesFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  const submit = useSubmit();
  const { tasks, addFiles, clearTask } = useUploadManager({
    onTaskEnd(_) {
      setTimeout(() => {
        submit({});
      }, 1000);
    },
  });
  const handleUploadStart = (fs: File[], access: "public-read" | "private") => {
    addFiles(fs, { access });
    onClose?.();
  };
  const handleClearAllTasks = () => {
    tasks.forEach((task) => {
      clearTask(task.id);
    });
  };
  // when use animate presence, also place a key in children
  return (
    <AnimatePresence>
      <Modal
        key="selector"
        containerClassName="z-50"
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
        noCloseButton={!tasks.every((t) => t.status === "Done")}
        onClose={handleClearAllTasks}
      >
        <ActiveUploads tasks={tasks} />
      </Modal>
    </AnimatePresence>
  );
};
