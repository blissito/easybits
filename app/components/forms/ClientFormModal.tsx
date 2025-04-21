import { Modal } from "../common/Modal";
import { ClientForm } from "./ClientForm";

export const ClientFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  return (
    <Modal
      mode="drawer"
      isOpen={isOpen}
      title="Datos del cliente"
      onClose={onClose}
    >
      <ClientForm onClose={onClose} />
    </Modal>
  );
};
