import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { ClientsTable } from "./clients/ClientsTable";
import { BrutalButton } from "~/components/common/BrutalButton";
import type { Route } from "./+types/clients";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { useState } from "react";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const clients = await db.client.findMany({
    where: {
      userId: user.id,
    },
  });
  return { clients, user };
};

export default function Clients({ loaderData }: Route.ComponentProps) {
  // const { clients, user } = loaderData;
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
      <Header title="Clientes" />
      {/* Aquí está el crud 👇🏼 */}
      <ClientsTable
        onOpen={handleOpen}
        onClose={handleClose}
        isFormOpen={showForm}
        clients={[
          {
            id: "abc",
            email: "perro@blissmo.com",
            displayName: "Pedro Vargas Gonzalez Garcia",
          },
          {
            id: "abc2",
            email: "sam@blissmo.com",
            displayName: "Samantha Figueroa Gardini de Lozada",
          },
        ]}
      />
    </article>
  );
}
