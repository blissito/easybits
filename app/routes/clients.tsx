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
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import { getPaginatedClients } from "~/.server/pagination/clients";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url, `http://${request.headers.get("host")}`);

  // 3 líneas para clientes paginados
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 20);
  const { clients, pagination } = await getPaginatedClients({
    user,
    page,
    pageSize,
  });

  // Si orders es necesario para la tabla, mantenlo:
  const assets = await db.asset.findMany({ where: { userId: user.id } });
  const assetIds = assets.map((a) => a.id);
  const orders = await db.order.findMany({
    where: { assetId: { in: assetIds } },
  });

  return { clients, user, orders, pagination };
};

export default function Clients({ loaderData }: Route.ComponentProps) {
  const { clients, orders, pagination } = loaderData;
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
      <Header title="Clientes" searcher={false} layout={false} />
      {/* Aquí está el crud 👇🏼 */}
      {clients.length > 0 ? (
        <PaginatedTable
          data={clients}
          totalItems={pagination.totalItems}
          config={{ defaultPageSize: pagination.pageSize }}
        >
          {(paginatedClients) => (
            <>
              <ClientsTable
                onOpen={handleOpen}
                onClose={handleClose}
                isFormOpen={showForm}
                clients={paginatedClients as Partial<Client>[]}
                orders={orders}
              />
              <TablePagination />
            </>
          )}
        </PaginatedTable>
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
        <img
          className="w-44 mx-auto "
          src="/empty-states/clients-empty.webp"
          alt="No hay clientes registrados"
        />
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
