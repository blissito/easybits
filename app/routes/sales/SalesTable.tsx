import type { Asset, Order, User } from "@prisma/client";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { useEffect } from "react";
import { DotsMenu } from "../files/DotsMenu";

export const SalesTable = ({ orders = [] }: { orders: Order[] }) => {
  if (orders.length < 1) return null;

  return (
    <article className="bg-brand-100 border-2 overflow-hidden rounded-xl border-black text-xs ">
      <section className="grid grid-cols-12 pl-4 py-2 border-b-2 border-black">
        <span className="col-span-1"></span>
        <span className="col-span-2">Asset</span>
        <span className="col-span-2">Email</span>
        <span className="col-span-2">Cliente</span>
        <span className="col-span-2">Fecha </span>
        <span className="col-span-2">Precio</span>
        <span className="col-span-1">Acciones</span>
      </section>
      <AnimatePresence>
        {orders.map((order) => (
          <Row order={order as any} key={order.id} />
        ))}
        {orders.length < 1 && (
          <motion.p
            key="empty"
            className="p-10 mx-auto text-center font-semibold bg-white"
          >
            Aún no tienes ventas 🥲
          </motion.p>
        )}
      </AnimatePresence>
    </article>
  );
};

const Row = ({ order }: { order: Order }) => {
  return (
    <motion.section
      layout
      initial={{ x: 10, opacity: 0 }}
      exit={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      key=""
      className={cn(
        "pl-4 bg-white",
        "hover:bg-gray-100 ",
        "grid grid-cols-12 py-2 md:py-3 border-b items-center"
      )}
    >
      {/* MetaImagen */}
      <section className={cn("col-span-1", "text-brand-gray flex flex-col")}>
        <img
          // @todo remove the merchantId from the url urgent! if you see this fix it!
          src={`https://easybits-public.fly.storage.tigris.dev/${order.merchantId}/gallery/${order.asset?.id}/metaImage`}
          alt="meta image"
          className="aspect-square w-10"
        />
      </section>
      {/* Asset */}
      <section className={cn("col-span-2", "text-brand-gray flex flex-col")}>
        <span className="text-black font-medium"> {order.asset?.title}</span>
      </section>
      {/* Email */}
      <section className={cn("col-span-2", "text-brand-gray grid")}>
        <span className="text-black"> {order.customer_email}</span>
      </section>
      {/* Cliente */}
      <section className={cn("col-span-2", "text-brand-gray grid")}>
        <p className="font-thin">
          {order.customer?.displayName || "Sin nombre"}
        </p>
      </section>
      {/* Fecha */}
      <section className={cn("col-span-2", "text-black md:col-span-2")}>
        <span>
          {new Date(order.createdAt).toLocaleDateString("es-MX", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </section>
      {/* Precio */}
      <section className={cn("col-span-2", "items-center md:col-span-2 flex")}>
        <span>{order.total}</span>
      </section>
      {/* Acciones */}
      <DotsMenu className="col-span-1">
        <button className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-grass transition-all">
          Exportar
        </button>
      </DotsMenu>
    </motion.section>
  );
};
