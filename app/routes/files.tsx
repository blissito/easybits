import { useState } from "react";
import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { AssetFormModal } from "~/components/forms/AssetFormModal";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";

// export const loader = async ({ request }: Route.LoaderArgs) => {
//   const user = await getUserOrRedirect(request);

//   const assets = await db.asset.findMany({
//     where: {
//       userId: user.id,
//     },
//   });
//   return { assets };
// };

export default function Page({ loaderData }: Route.ComponentProps) {
  const [showModal, setShowModal] = useState(true);
  return (
    <>
      <article className="min-h-[95vh] overflow-hidden py-20 px-10 w-full relative box-border inline-block">
        <GridBackground />
        <section className="z-20 relative">
          <h1 className="text-4xl font-semibold">Almacenamiento de archivos</h1>
          <EmptyFiles onClick={() => setShowModal(true)} />
        </section>
      </article>
      <FilesFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
