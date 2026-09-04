import { useEffect, useState } from "react";
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
  confirmPhrase,
}: {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  /**
   * Si se pasa, el botón queda bloqueado hasta que el usuario escriba esta
   * frase exacta (típicamente el nombre del recurso). Para lo que no se puede
   * deshacer: un click de más no debe poder destruir una máquina.
   */
  confirmPhrase?: string;
}) {
  const [typed, setTyped] = useState("");
  // Cada apertura arranca en blanco — si no, el texto de la confirmación
  // anterior deja el botón ya habilitado para el siguiente recurso.
  useEffect(() => {
    if (isOpen) setTyped("");
  }, [isOpen]);
  const locked = !!confirmPhrase && typed.trim() !== confirmPhrase;
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
      {confirmPhrase && (
        <label className="block mb-6 text-sm">
          <span className="text-gray-600">
            Escribe <strong className="font-mono">{confirmPhrase}</strong> para confirmar:
          </span>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-2 w-full border-2 border-black rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#9870ED]"
          />
        </label>
      )}
      <div className="flex justify-end gap-3 mt-auto">
        <BrutalButton mode="ghost" onClick={onCancel}>
          {cancelLabel}
        </BrutalButton>
        <BrutalButton
          mode={destructive ? "danger" : "brand"}
          isDisabled={locked}
          onClick={() => {
            if (!locked) onConfirm();
          }}
        >
          {confirmLabel}
        </BrutalButton>
      </div>
    </Modal>
  );
}
