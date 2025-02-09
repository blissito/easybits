import { useState, type ChangeEvent } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Input } from "~/components/common/Input";
import { Modal } from "~/components/common/Modal";

export const ConfirmModal = ({
  onClose,
  isOpen,
  onConfirm,
  fileName,
}: {
  fileName: string;
  onClose: () => void;
  isOpen: boolean;
  onConfirm: () => void;
}) => {
  const [typed, setTyped] = useState("");
  const handleClose = () => {
    setTyped("");
    onClose?.();
  };

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <Modal
      onClose={handleClose}
      isOpen={isOpen}
      title="Segur@ de eliminar el archivo?"
      className="min-h-0"
      footer={
        <>
          <BrutalButton onClick={onClose} mode="ghost">
            Cancelar
          </BrutalButton>
          <BrutalButton
            onClick={handleConfirm}
            isDisabled={typed !== fileName}
            className="bg-brand-pink"
          >
            Eliminar permanentemente
          </BrutalButton>
        </>
      }
    >
      <p>
        Para confirmar, escribe: "
        <strong className="text-brand-500">{fileName}</strong>"
      </p>
      <Input
        value={typed}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setTyped(e.currentTarget.value)
        }
      />
    </Modal>
  );
};
