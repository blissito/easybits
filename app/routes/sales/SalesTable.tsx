import type { Asset, Order, User } from "@prisma/client";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { useEffect } from "react";
import { DotsMenu } from "../files/DotsMenu";
import type { Payment } from "~/.server/stripe_v2";

export const SalesTable = ({ stripeId }: { stripeId?: string }) => {
  if (!stripeId) return null;

  const fetcher = useFetcher();
  useEffect(() => {
    fetcher.submit(
      { intent: "get_account_payments", stripeId },
      { method: "post", action: "/api/v1/stripe/account" }
    );
  }, []);
  const paymentIntents: Payment[] = fetcher.data?.payments || [];
  const capabilities: Record<string, string> = fetcher.data?.capabilities || {};
  if (capabilities.card_payments?.status !== "active") return null; // only if active account

  return (
    <article className="bg-brand-100 border-2 overflow-hidden rounded-xl border-black text-xs ">
      <section className="grid grid-cols-12 pl-4 py-2 border-b-2 border-black">
        <span className="col-span-3">Email</span>
        <span className="col-span-2">Asset</span>
        <span className="col-span-3">Fecha </span>
        <span className="col-span-2">Precio</span>
        <span className="col-span-2"></span>
      </section>
      <AnimatePresence>
        {paymentIntents.map((payment) => (
          <Row payment={payment} key={payment.id} />
        ))}
        {paymentIntents.length < 1 && (
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

const Row = ({ payment }: { payment: Payment }) => {
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
      {/* Email */}
      <section className={cn("col-span-3", "text-brand-gray flex flex-col")}>
        <span className="text-black"> {payment.user?.email}</span>
        <span className="block md:hidden"> {payment.user?.displayName}</span>
      </section>
      {/* Asset title */}
      <section className={cn("col-span-2", "text-brand-gray")}>
        <span> {payment.asset?.title}</span>
      </section>
      {/* Fecha */}
      <section className={cn("col-span-3", "text-black md:col-span-2")}>
        <span>
          {new Date(payment.createdAt).toLocaleDateString("es-MX", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </section>
      {/* Precio */}
      <section className={cn("col-span-2", "items-center md:col-span-2 flex")}>
        <span>
          $ {payment.asset?.price} {payment.asset?.currency}
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
