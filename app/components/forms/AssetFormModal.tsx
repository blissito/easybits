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
    <Modal
      isOpen={isOpen}
      title="¡Empecemos!"
      onClose={onClose}
      className="px-12"
    >
      <AssetForm onClose={onClose} />
    </Modal>
  );
};
