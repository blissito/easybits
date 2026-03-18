import { Modal } from "./Modal";
import { BrutalButton } from "./BrutalButton";

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  destructive = false,
}: {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      className="min-h-0 min-w-0 w-auto max-w-md"
    >
      {message && (
        <p className="text-sm text-gray-600 mb-6">{message}</p>
      )}
      <div className="flex justify-end gap-3 mt-auto">
        <BrutalButton mode="ghost" onClick={onCancel}>
          {cancelLabel}
        </BrutalButton>
        <BrutalButton
          mode={destructive ? "danger" : "brand"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </BrutalButton>
      </div>
    </Modal>
  );
}
