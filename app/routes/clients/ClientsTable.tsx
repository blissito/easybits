import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
// import toast from "react-hot-toast";
import { DotsMenu } from "../files/DotsMenu";
// import { useCrud } from "~/hooks/useCrud";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Order, User } from "@prisma/client";
import { createPortal } from "react-dom";
import { ClientFormModal } from "~/components/forms/ClientFormModal";

export const ClientsTable = ({
  clients = [],
  isFormOpen,
  onClose,
  onOpen,
  orders = [],
}: {
  orders?: Order[];
  onClose: () => void;
  onOpen: () => void;
  isFormOpen?: boolean;
  clients: Partial<User>[];
}) => {
  const portalNode = useRef<HTMLElement>(null);
  // const { create, update, remove } = useCrud({
  //   modelName: "Client",
  // });

  const handleRemove = (id: string) => () => {
    // remove(id); // @todo: block instead
  };

  const [detail, setDetail] = useState<Partial<User> | null>(null);
  const openDetailModal = (userId: string) => () => {
    const client = clients.find((c) => c.id === userId);
    setDetail(client as User);
  };

  const closeDetailModal = () => {
    setDetail(null);
  };

  useEffect(() => {
    if (document.body) {
      portalNode.current = document.body;
    }
  }, []);
  return (
    <article className="bg-white border-2 overflow-hidden rounded-xl border-black text-xs">
      <Header />
      <AnimatePresence>
        {clients.map((client) => (
          // Necesitamos no usar overflow-hidden en el padre para mostrar el menu correctamente
          <Row
            key={client.id}
            orders={orders}
            client={client}
            menu={
              <>
                <button
                  onClick={handleRemove(client.id!)}
                  className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-red transition-all"
                >
                  Bloquear
                </button>
                <button
                  onClick={openDetailModal(client.id!)}
                  className="w-max p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-500 transition-all"
                >
                  Ver detalle
                </button>
              </>
            }
          />
        ))}
      </AnimatePresence>
      {detail &&
        createPortal(
          <ClientFormModal
            orders={orders.filter((o) => o.userId === detail.id)}
            client={detail}
            onClose={closeDetailModal}
            isOpen={!!detail}
          />,
          portalNode.current!
        )}
    </article>
  );
};

// @TODO: create a portal for the menu, to avoid overflow hidden
const Row = ({
  menu,
  client,
  orders = [],
}: {
  orders?: Order[];
  menu?: ReactNode;
  client: Partial<User>;
}) => {
  const getOrdersLength = (userId: string) => {
    return orders.filter((o) => o.userId === userId).length;
  };
  const getLastOrder = (userId: string) => {
    const os = orders.filter((o) => o.userId === userId);
    // @ts-ignore
    os.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // @revisit and confirm
    return new Date(os[0]?.createdAt).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  return (
    <motion.section
      layout
      initial={{ x: 10, opacity: 0 }}
      exit={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      key=""
      className={cn(
        "pl-4",
        "hover:bg-brand-100/50 ",
        "grid grid-cols-12 py-2 md:py-3 border-b  items-center"
      )}
    >
      <Cell>
        <input
          type="checkbox"
          className="text-brand-500 border rounded focus:outline-brand-500 border-black"
        />
      </Cell>
      <Cell>
        <img
       className="h-10 w-10 rounded-full bg-[#FEFEFE]"
          src={client.picture}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src =
              "/logo-default.svg";
          }}
          alt="user"
        />
      </Cell>
      <Cell className="col-span-3">
        <span> {client.email}</span>
      </Cell>
      <Cell className="col-span-3">
        <span> {client.displayName}</span>
      </Cell>
      <Cell>{getOrdersLength(client.id)}</Cell>
      <Cell className="col-span-2">{getLastOrder(client.id)}</Cell>
      <Cell>
        <DotsMenu>{menu}</DotsMenu>
      </Cell>
    </motion.section>
  );
};

const Cell = ({
  children,
  className,
  ...props
}: {
  className?: string;
  children: ReactNode;
  [x: string]: unknown;
}) => {
  return (
    <section {...props} className={className}>
      {children}
    </section>
  );
};

const Header = () => {
  return (
    <section className="grid bg-brand-100 grid-cols-12 pl-4 py-2 border-b-2 border-black">
      <span className="col-span-1" />
      <span className="col-span-1" />
      <span className="col-span-3">Email</span>
      <span className="col-span-3">Cliente</span>
      <span className="col-span-1">Compras</span>
      <span className="col-span-2">Última compra</span>
      <span className="">Acciones</span>
    </section>
  );
};
