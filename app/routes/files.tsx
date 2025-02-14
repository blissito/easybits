import { useState } from "react";
import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { FilesTable } from "./files/FilesTable";
import { ShareTokensModal } from "~/components/forms/files/ShareTokensModal";
import type { File } from "@prisma/client";
import { FileDetailModal } from "~/components/forms/files/FileDetailModal";

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
  const [detailFile, setDetailFile] = useState<null | File>(null);
  const open = () => setShowModal(true);
  // tokens
  const [tokenFor, setTokenFor] = useState<File | null>(null);
  const openTokensModal = (file: File) => setTokenFor(file);
  return (
    <>
      <article className="min-h-[calc(100vh-1px)] overflow-hidden py-20 px-10 relative">
        <GridBackground />
        <section className="z-10 relative">
          <h1 className="text-4xl font-semibold">Almacenamiento de archivos</h1>
          {files.length < 1 && (
            <EmptyFiles onClick={() => setShowModal(true)} />
          )}
          <hr className="border-none py-3" />
          {files.length > 0 && (
            <FilesTable
              onTokenClick={openTokensModal}
              onClick={open}
              files={files}
              onDetail={(file: File) => {
                setDetailFile(file);
              }}
            />
          )}
        </section>
      </article>
      <FilesFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
      <ShareTokensModal tokenFor={tokenFor} onClose={() => setTokenFor(null)} />
      <FileDetailModal
        onClose={() => setDetailFile(null)}
        isOpen={!!detailFile}
        file={detailFile}
      />
    </>
  );
}
