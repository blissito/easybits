import { useState, type ReactNode } from "react";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { getClientForFile } from "~/.server/storage";
import { FilesTable } from "./files/FilesTable";
import { ShareTokensModal } from "~/components/forms/files/ShareTokensModal";
import type { File } from "@prisma/client";
import { FilePreviewModal } from "~/components/files/FilePreviewModal";
import { BrutalButton } from "~/components/common/BrutalButton";
import { plans } from "./profile/profileComponents";
import { Link, data, useFetcher } from "react-router";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const plan = user.roles.find((r) => r === "Creative" || r === "Expert");
  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      ownerId: user.id,
      status: { not: "DELETED" },
      NOT: { name: { startsWith: "sites/" } },
    },
  });
  const total = files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024 / 1024; // GB

  return { plan, files, total };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "preview") {
    const fileId = formData.get("fileId") as string;
    if (!fileId) throw data({ error: "Missing fileId" }, { status: 400 });
    const file = await db.file.findFirst({
      where: { id: fileId, ownerId: user.id },
      select: { storageKey: true, storageProviderId: true, access: true, url: true },
    });
    if (!file) throw data({ error: "File not found" }, { status: 404 });
    if (file.access === "public" && file.url) {
      return { previewUrl: file.url };
    }
    const client = await getClientForFile(file.storageProviderId, user.id);
    const previewUrl = await client.getReadUrl(file.storageKey, 3600);
    return { previewUrl };
  }

  throw data({ error: "Invalid intent" }, { status: 400 });
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { files, plan = "Spark", total } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<null | File>(null);
  const open = () => setShowModal(true);
  // tokens
  const [tokenFor, setTokenFor] = useState<File | null>(null);
  const openTokensModal = (file: File) => setTokenFor(file);

  return (
    <>
      <Layout
        plan={plan}
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
              setPreviewFile(file);
            }}
          />
        )}
      </Layout>
      <FilesFormModal isOpen={showModal} onClose={() => setShowModal(false)} />
      <ShareTokensModal tokenFor={tokenFor} onClose={() => setTokenFor(null)} />
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}

const Layout = ({
  used,
  cta,
  plan,
  children,
}: {
  plan: string;
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
              Usado: <strong>{used < 1 ? `${(used * 1024).toFixed(1)} MB` : `${used.toFixed(2)} GB`}</strong> de{" "}
              <strong>{plans[plan].max} GB </strong>(Plan {plan}){" "}
              <Link to="/planes" className="text-xs underline text-brand-500">
                Mejorar plan
              </Link>
            </p>
          </div>
          {cta}
        </div>
        {children}
      </section>
    </article>
  );
};
