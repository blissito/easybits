import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import toast from "react-hot-toast";
import { DotsMenu } from "../files/DotsMenu";
import { useCrud } from "~/hooks/useCrud";
import { useEffect, useRef, type ReactNode } from "react";
import type { Client } from "@prisma/client";
import { createPortal } from "react-dom";
import { ClientFormModal } from "~/components/forms/ClientFormModal";

export const ClientsTable = ({
  clients = [],
  isFormOpen,
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: () => void;
  isFormOpen?: boolean;
  clients: Client[];
}) => {
  const portalNode = useRef<HTMLElement>(null);
  const { create, update, remove } = useCrud({
    modelName: "Client",
  });

  const handleRemove = (id: string) => () => {
    remove(id);
  };

  useEffect(() => {
    if (document.body) {
      portalNode.current = document.body;
    }
  }, []);

  return (
    <article className="bg-white border-[2px] rounded-xl border-black text-xs overflow-hidden">
      <Header />
      <AnimatePresence>
        {clients.map((client) => (
          <Row
            client={client}
            menu={
              <button
                onClick={handleRemove(client.id)}
                className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-red transition-all"
              >
                Eliminar
              </button>
            }
          />
        ))}
      </AnimatePresence>
      {isFormOpen &&
        createPortal(
          <ClientFormModal onClose={onClose} isOpen={isFormOpen} />,
          portalNode.current!
        )}
    </article>
  );
};

// @TODO: create a portal for the menu, to avoid overflow hidden
const Row = ({ menu, client }: { menu?: ReactNode; client: Client }) => {
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
          className="h-10 w-10 rounded-full"
          src="https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt="user"
        />
      </Cell>
      <Cell className="col-span-3">
        <span> {client.email}</span>
      </Cell>
      <Cell className="col-span-3">
        <span> {client.displayName}</span>
      </Cell>
      <Cell>10</Cell>
      <Cell className="col-span-2">
        {new Date().toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </Cell>
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
    <section className="grid bg-brand-100 grid-cols-12 pl-4 py-2 border-b-[2px] border-black">
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
