import { Modal } from "../common/Modal";
import { AssetForm } from "./AssetForm";

export const AssetFormModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) => {
  return (
    <Modal isOpen={isOpen} title="¡Empecemos!" mode="overlay" onClose={onClose}>
      <AssetForm onClose={onClose} />
    </Modal>
  );
};
