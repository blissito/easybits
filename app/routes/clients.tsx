import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { ClientsTable } from "./clients/ClientsTable";
import { BrutalButton } from "~/components/common/BrutalButton";
import type { Route } from "./+types/clients";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { useState } from "react";
import type { Client } from "@prisma/client";
import { Empty } from "./assets/Empty";
import { MdOutlineContentCopy } from "react-icons/md";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const assets = await db.asset.findMany({
    where: {
      userId: user!.id,
    },
  });
  const assetIds = assets.map((a) => a.id);
  const clients = await db.user.findMany({
    where: {
      assetIds: {
        hasSome: assetIds, // @revisit interesting?
      },
    },
    select: {
      picture: true,
      id: true,
      displayName: true,
      email: true,
    },
  });
  const orders = await db.order.findMany({
    where: {
      assetId: {
        in: assetIds,
      },
    },
  });
  // const userOrders = orders.filter(o=>clients[0].id === o.userId)
  return { clients, user, orders };
};

export default function Clients({ loaderData }: Route.ComponentProps) {
  const { clients, orders } = loaderData;
  const [showForm, setShowForm] = useState(false);

  const handleClose = () => {
    setShowForm(false);
  };

  const handleOpen = () => {
    setShowForm(true);
  };

  return (
    <article
      className={cn(
        " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8 2xl:px-0",

        LAYOUT_PADDING
      )}
    >
      <Header title="Clientes" searcher={false} />
      {/* Aquí está el crud 👇🏼 */}
      {clients.length > 0 ? (
        <ClientsTable
          onOpen={handleOpen}
          onClose={handleClose}
          isFormOpen={showForm}
          clients={clients as Partial<Client>[]}
          orders={orders}
        />
      ) : (
        <EmptyClients />
      )}
    </article>
  );
}

const EmptyClients = () => {
  return (
    <Empty
      illustration={
        <img className="w-44 mx-auto " src="/empty-states/clients-empty.webp" alt="No hay clientes registrados" />
      }
      title=" ¡Vaya! Aún no hay clientes en tu lista"
      text={<span>Comparte tu tienda y consigue tu primera venta.</span>}
      footer={
        <BrutalButton className=" flex gap-2 items-center">
          <MdOutlineContentCopy />
          Copiar link
        </BrutalButton>
      }
    />
  );
};
