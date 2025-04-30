import type { Order, User } from "@prisma/client";
import { BrutalButton } from "../common/BrutalButton";
import { Avatar } from "../common/Avatar";

export const ClientForm = ({
  onClose,
  client,
  orders,
}: {
  orders: Order[];
  client: Partial<User>;
  onClose?: () => void;
}) => {
  return (
    <article>
      <Avatar src={client.picture} size="xl" className="mb-4" />
      <ShowInfo user={client} />
      <Orders orders={orders} />
      <nav className="flex justify-end mt-12 gap-6 md:gap-8 fixed bottom-8 right-8">
        <BrutalButton className="bg-white" onClick={onClose} type="button">
          Cancelar
        </BrutalButton>
        <BrutalButton mode="danger" isDisabled type="submit">
          Bloquear
        </BrutalButton>
      </nav>
    </article>
  );
};

const Orders = ({ orders }: { orders: Order[] }) => {
  return (
    <div className="mb-4">
      <h3 className="font-bold">Assets:</h3>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>{o.assetId}</li>
        ))}
      </ul>
    </div>
  );
};

const ShowInfo = ({ user }: { user: Partial<User> }) => {
  return (
    <article>
      <div className="mb-4">
        <h3 className="font-bold">Nombre:</h3>
        <p>{user.displayName || "Ninguno"}</p>
      </div>
      <div className="mb-4">
        <h3 className="font-bold">Email:</h3>
        <p>{user.email}</p>
      </div>
      <div className="mb-4">
        <h3 className="font-bold">Teléfono:</h3>
        <p>{user.phoneNumber || "Ninguno"}</p>
      </div>
    </article>
  );
};
