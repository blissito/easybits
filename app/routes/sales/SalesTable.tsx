import type { Asset, File, Order, User } from "@prisma/client";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { useState } from "react";
import { useStartVersioningFlyMachine } from "~/hooks/useStartVersioningFlyMachine";
import toast from "react-hot-toast";
import { DotsMenu } from "../files/DotsMenu";

export const SalesTable = ({ orders }: { orders: Order[] }) => {
  return (
    <>
      <article className="bg-white border-[1px] rounded-xl border-black text-xs ">
        <section className="grid grid-cols-12 pl-4 py-2 border-b border-black">
          <span className="col-span-3">Email</span>
          <span className="col-span-2">Asset</span>
          <span className="col-span-3">Fecha </span>
          <span className="col-span-2">Precio</span>
          <span className="col-span-2"></span>
        </section>
        <AnimatePresence>
          {orders.map((o) => (
            <Row order={o} key={o.id} />
          ))}
        </AnimatePresence>
      </article>
    </>
  );
};

const Row = ({ order }: { order: Order & { user: User; asset: Asset } }) => {
  return (
    <motion.section
      layout
      initial={{ x: 10, opacity: 0 }}
      exit={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      key=""
      className={cn(
        "pl-4",
        "hover:bg-gray-100 ",
        "grid grid-cols-12 py-2 md:py-3 border-b items-center"
      )}
    >
      {/* Email */}
      <section className={cn("col-span-3", "text-brand-gray flex flex-col")}>
        <span className="text-black"> {order.user.email}</span>
        <span className="block md:hidden"> {order.user.displayName}</span>
      </section>
      {/* Asset title */}
      <section className={cn("col-span-2", "text-brand-gray")}>
        <span> {order.asset.title}</span>
      </section>
      {/* Fecha */}
      <section className={cn("col-span-3", "text-black md:col-span-2")}>
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
        <span>
          $ {order.asset.price} {order.asset.currency}
        </span>
      </section>
      {/* Acciones */}
      <DotsMenu>
        <button className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-grass transition-all">
          Exportar
        </button>
      </DotsMenu>
    </motion.section>
  );
};
