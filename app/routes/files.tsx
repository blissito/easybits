import { useState } from "react";
import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { FilesTable } from "./files/FilesTable";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      ownerId: user.id,
    },
  });
  return { files };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { files } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const open = () => setShowModal(true);
  return (
    <>
      <article className="min-h-[95vh] overflow-hidden py-20 px-10 w-full relative box-border inline-block">
        <GridBackground />
        <section className="z-20 relative">
          <h1 className="text-4xl font-semibold">Almacenamiento de archivos</h1>
          {files.length < 1 && (
            <EmptyFiles onClick={() => setShowModal(true)} />
          )}
          <hr className="border-none py-3" />
          {files.length > 0 && <FilesTable onClick={open} files={files} />}
        </section>
      </article>
      <FilesFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
