import { useState, useEffect, type ReactNode } from "react";
import type { Route } from "./+types/files";
import { EmptyFiles } from "./files/EmptyFiles";
import { FilesFormModal } from "~/components/forms/files/FilesFormModal";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { getClientForFile, getPlatformDefaultClient } from "~/.server/storage";
import { FilesTable } from "./files/FilesTable";
import { ShareTokensModal } from "~/components/forms/files/ShareTokensModal";
import type { File } from "@prisma/client";
import { FilePreviewModal } from "~/components/files/FilePreviewModal";
import { BrutalButton } from "~/components/common/BrutalButton";
import { PLANS, getUserPlan, type PlanKey } from "~/lib/plans";
import { Link, data, useFetcher } from "react-router";
import { StorageBar, getStorageStats } from "~/components/common/StorageBar";

const PAGE_SIZE = 50;

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const plan = getUserPlan(user);

  const where = {
    ownerId: user.id,
    status: { not: "DELETED" as const },
    NOT: { name: { startsWith: "sites/" } },
  };

  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
    where,
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = files.length > PAGE_SIZE;
  const items = hasMore ? files.slice(0, PAGE_SIZE) : files;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const total = await getStorageStats(user.id, db);

  return { plan, files: items, total, nextCursor };
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
    // Public files: use direct URL
    if (file.access !== "private" && file.url) {
      return { previewUrl: file.url };
    }
    // Custom provider: use its client (has its own prefix)
    if (file.storageProviderId) {
      const client = await getClientForFile(file.storageProviderId, user.id);
      const previewUrl = await client.getReadUrl(file.storageKey, 3600);
      return { previewUrl };
    }
    // Platform files: UI uploads live at storageKey directly, MCP/API uploads at mcp/storageKey.
    // UI files have a non-empty url pointing to the bucket; MCP private files have url "".
    const isMcpFile = !file.url || file.url.includes("/mcp/");
    const client = getPlatformDefaultClient({ prefix: isMcpFile ? "mcp/" : "" });
    const previewUrl = await client.getReadUrl(file.storageKey, 3600);
    return { previewUrl };
  }

  throw data({ error: "Invalid intent" }, { status: 400 });
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { files: initialFiles, plan = "Byte", total, nextCursor } = loaderData;
  const [allFiles, setAllFiles] = useState<File[]>(initialFiles);
  const [cursor, setCursor] = useState<string | null>(nextCursor);
  const [showModal, setShowModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<null | File>(null);
  const open = () => setShowModal(true);
  const [tokenFor, setTokenFor] = useState<File | null>(null);
  const openTokensModal = (file: File) => setTokenFor(file);
  const loadMoreFetcher = useFetcher<typeof loader>();
  const [appendedCursors, setAppendedCursors] = useState<Set<string>>(new Set());

  // Append loaded files when fetcher completes
  useEffect(() => {
    if (loadMoreFetcher.data && loadMoreFetcher.state === "idle") {
      const d = loadMoreFetcher.data;
      const newFiles = d.files as File[];
      const firstId = newFiles[0]?.id;
      if (firstId && !appendedCursors.has(firstId)) {
        setAllFiles((prev) => [...prev, ...newFiles]);
        setCursor(d.nextCursor);
        setAppendedCursors((prev) => new Set(prev).add(firstId));
      }
    }
  }, [loadMoreFetcher.data, loadMoreFetcher.state]);

  const handleLoadMore = () => {
    if (!cursor) return;
    loadMoreFetcher.load(`/dash/archivos?cursor=${cursor}`);
  };

  return (
    <>
      <Layout
        plan={plan}
        used={total}
        cta={
          allFiles.length > 0 && (
            <BrutalButton
              isDisabled={PLANS[plan as PlanKey]?.storageGB ?? 1 < total}
              onClick={open}
              containerClassName="block md:mt-0 md:ml-auto "
            >
              + Subir archivo
            </BrutalButton>
          )
        }
      >
        {allFiles.length < 1 && <EmptyFiles onClick={() => setShowModal(true)} />}
        {allFiles.length > 0 && (
          <>
            <FilesTable
              onTokenClick={openTokensModal}
              files={allFiles}
              onDetail={(file: File) => {
                setPreviewFile(file);
              }}
            />
            {cursor && (
              <div className="flex justify-center mt-6">
                <BrutalButton
                  size="chip"
                  onClick={handleLoadMore}
                  isLoading={loadMoreFetcher.state !== "idle"}
                >
                  Cargar más
                </BrutalButton>
              </div>
            )}
          </>
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
            <StorageBar usedGB={used} planKey={plan} />
          </div>
          {cta}
        </div>
        {children}
      </section>
    </article>
  );
};
