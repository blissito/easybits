import { useState } from "react";
import { Modal } from "../../common/Modal";
import { FilesForm } from "./FilesForm";

export const FilesFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  return (
    <Modal
      isOpen={isOpen}
      title="Sube tus archivos"
      onClose={onClose}
      className="px-12 min-h-[600px]"
    >
      <FilesForm onClose={onClose} />
    </Modal>
  );
};
