import type { Order, User } from "@prisma/client";
import { Modal } from "../common/Modal";
import { ClientForm } from "./ClientForm";

export const ClientFormModal = ({
  isOpen,
  onClose,
  client,
  orders = [],
}: {
  orders: Order[];
  client: Partial<User>;
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
      <ClientForm orders={orders} client={client} onClose={onClose} />
    </Modal>
  );
};
