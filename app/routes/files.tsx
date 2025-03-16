import { useState } from "react";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { FilesTable } from "./files/FilesTable";
import { ShareTokensModal } from "~/components/forms/files/ShareTokensModal";
import type { File } from "@prisma/client";
import { FileDetailModal } from "~/components/forms/files/FileDetailModal";
import { BrutalButton } from "~/components/common/BrutalButton";

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
      <article className="min-h-[calc(100vh-1px)] overflow-hidden relative w-full">
        <section className=" max-w-7xl mx-auto w-full py-6 md:py-10 px-4 md:px-[5%] lg:px-0 ">
          <div className="flex h-fit mb-8 md:mb-10 flex-wrap">
            <h2 className="text-3xl md:text-4xl font-semibold">
              Almacenamiento de archivos
            </h2>{" "}
            <BrutalButton
              onClick={open}
              containerClassName="block ml-0 mt-3 md:mt-0 md:ml-auto "
            >
              + Subir archivo
            </BrutalButton>
          </div>
          {files.length < 1 && (
            <EmptyFiles onClick={() => setShowModal(true)} />
          )}

          {files.length > 0 && (
            <FilesTable
              onTokenClick={openTokensModal}
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
