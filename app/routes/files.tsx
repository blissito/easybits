import { useState, type ReactNode } from "react";
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
import { plans } from "./profile/profileComponents";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const plan = user.roles.find((r) => r === "Creative" || r === "Expert");
  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      ownerId: user.id,
    },
  });
  const total = files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024 / 1024; // GB
  return { plan, files, total };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { files, plan = "Starter", total } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [detailFile, setDetailFile] = useState<null | File>(null);
  const open = () => setShowModal(true);
  // tokens
  const [tokenFor, setTokenFor] = useState<File | null>(null);
  const openTokensModal = (file: File) => setTokenFor(file);

  return (
    <>
      <Layout
        used={total}
        cta={
          files.length > 0 && (
            <BrutalButton
              isDisabled={plans[plan].max < total}
              onClick={open}
              containerClassName="block md:mt-0 md:ml-auto "
            >
              + Subir archivo
            </BrutalButton>
          )
        }
      >
        {files.length < 1 && <EmptyFiles onClick={() => setShowModal(true)} />}
        {files.length > 0 && (
          <FilesTable
            onTokenClick={openTokensModal}
            files={files}
            onDetail={(file: File) => {
              setDetailFile(file);
            }}
          />
        )}
      </Layout>
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

const Layout = ({
  used,
  cta,
  children,
}: {
  used: number;
  cta?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <article className="min-h-[calc(100vh-2px)] overflow-hidden box-border relative w-full">
      <section className=" max-w-7xl mx-auto w-full pt-16 pb-6 md:py-10 px-4 md:pl-28 md:pr-8  2xl:px-0 ">
        <div className="mb-8 md:mb-10 flex justify-between items-center">
          <div>
            <h2 className="text-3xl lg:text-4xl font-semibold">
              Almacenamiento de archivos
            </h2>
            <p>
              Usado: <strong>{used.toFixed(2)} GB</strong>
            </p>
          </div>
          {cta}
        </div>
        {children}
      </section>
    </article>
  );
};
