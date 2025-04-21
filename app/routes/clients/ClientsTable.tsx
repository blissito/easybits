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
      <span className="">
        <input
          type="checkbox"
          className="text-brand-500 border rounded focus:outline-brand-500 border-black"
        />
      </span>
      <button className="truncate font-semibold col-span-2 md:col-span-1 text-left flex flex-col">
        <img
          className="h-10 w-10 rounded-full"
          src="https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt="user"
        />
      </button>
      <div className="text-brand-gray col-span-5 md:col-span-4 lg:col-span-2 flex flex-col">
        <span className="text-black"> {client.email}</span>
        <span className="block lg:hidden"> {client.displayName}</span>
      </div>

      <span className="text-brand-gray col-span-2 hidden lg:block">
        {" "}
        Fulanito Lopez
      </span>
      <span className="text-brand-gray col-span-2 md:col-span-1 ">1</span>
      <span className=" items-center  col-span-2 hidden md:flex">
        {" "}
        10 nov 2024
      </span>
      <span className=" items-center  col-span-2 hidden md:flex">
        15 dic 2024
      </span>

      <DotsMenu>{menu}</DotsMenu>
    </motion.section>
  );
};

const Header = () => {
  return (
    <section className="grid bg-brand-100 grid-cols-12 pl-4 py-2 border-b-[2px] border-black">
      <span className=""></span>
      <span className=" col-span-2 md:col-span-1">Foto</span>
      <span className="col-span-5  md:col-span-4 lg:col-span-2">Email</span>
      <span className="col-span-2 hidden lg:block ">Nombre</span>
      <span className="col-span-1">Compras</span>
      <span className="col-span-2 hidden md:block">Fecha de registro</span>
      <span className="col-span-2  hidden md:block">Última compra</span>
      <span className="col-span-1"></span>
    </section>
  );
};
