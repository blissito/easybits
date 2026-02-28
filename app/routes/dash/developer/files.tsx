import { useEffect, useState } from "react";
import { useLoaderData, useSearchParams, useFetcher, useRevalidator, data } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { deleteFile, restoreFile } from "~/.server/core/operations";
import type { AuthContext } from "~/.server/apiAuth";
import type { Route } from "./+types/files";

export const meta = () => [
  { title: "Archivos — EasyBits" },
  { name: "robots", content: "noindex" },
];
import { IconRenderer } from "~/routes/files/IconRenderer";
import { Copy } from "~/components/common/Copy";
import { FaVideo, FaRegImage, FaRegFilePdf, FaMusic, FaBook } from "react-icons/fa6";
import { MdFolderZip } from "react-icons/md";
import { GiMagicLamp } from "react-icons/gi";
import { ShareTokensModal } from "~/components/forms/files/ShareTokensModal";
import type { File } from "@prisma/client";
import { AnimatePresence, motion } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const trash = url.searchParams.get("trash") === "1";
  const limit = 25;

  const where: Record<string, unknown> = { ownerId: user.id };
  if (trash) {
    where.status = "DELETED";
  } else {
    where.status = { not: "DELETED" };
  }
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const files = await db.file.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      size: true,
      contentType: true,
      access: true,
      url: true,
      status: true,
      storageProviderId: true,
      source: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  const hasMore = files.length > limit;
  const items = hasMore ? files.slice(0, limit) : files;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor, trash };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const ctx: AuthContext = {
    user,
    scopes: ["READ", "WRITE", "DELETE", "ADMIN"],
  };

  if (intent === "delete") {
    const fileId = formData.get("fileId") as string;
    if (!fileId) throw data({ error: "Missing fileId" }, { status: 400 });
    await deleteFile(ctx, fileId);
    return { ok: true };
  }

  if (intent === "restore") {
    const fileId = formData.get("fileId") as string;
    if (!fileId) throw data({ error: "Missing fileId" }, { status: 400 });
    await restoreFile(ctx, fileId);
    return { ok: true };
  }

  throw data({ error: "Invalid intent" }, { status: 400 });
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntilPurge(deletedAt: string | null) {
  if (!deletedAt) return null;
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + 7 * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

function DeleteButton({ fileId }: { fileId: string }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      onSubmit={(e) => {
        if (!confirm("¿Mover a la papelera?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="fileId" value={fileId} />
      <BrutalButton mode="danger" size="chip" type="submit" isLoading={isDeleting}>
        Eliminar
      </BrutalButton>
    </fetcher.Form>
  );
}

function RestoreButton({ fileId }: { fileId: string }) {
  const fetcher = useFetcher();
  const isRestoring = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="restore" />
      <input type="hidden" name="fileId" value={fileId} />
      <BrutalButton mode="ghost" size="chip" type="submit" isLoading={isRestoring}>
        Restaurar
      </BrutalButton>
    </fetcher.Form>
  );
}

export default function DevFilesPage() {
  const { items, nextCursor, trash } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const [tokenFor, setTokenFor] = useState<Pick<File, "id" | "name"> | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/sse/files");
    es.onmessage = (event) => {
      if (event.data === "changed") {
        revalidator.revalidate();
      }
    };
    return () => es.close();
  }, [revalidator]);

  const toggleTrash = () => {
    const params = new URLSearchParams(searchParams);
    if (trash) {
      params.delete("trash");
    } else {
      params.set("trash", "1");
    }
    params.delete("cursor");
    setSearchParams(params);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search files..."
          defaultValue={searchParams.get("q") || ""}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) params.set("q", e.target.value);
            else params.delete("q");
            params.delete("cursor");
            setSearchParams(params);
          }}
          className="border-2 border-black rounded-xl px-4 py-2 text-sm font-mono flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        />
        <motion.button
          onClick={toggleTrash}
          whileTap={{ scale: 0.95 }}
          layout
          className={`px-4 py-2 rounded-xl border-2 border-black text-sm font-bold transition-colors shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
            trash
              ? "bg-brand-red text-white"
              : "bg-white hover:bg-gray-100"
          }`}
        >
          {trash ? "Ver archivos" : "Papelera"}
        </motion.button>
      </div>

      <motion.div
        layout
        className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white"
      >
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Size</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Acceso</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Link</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Fuente</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Provider</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">
                {trash ? "Purge in" : "Status"}
              </th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <AnimatePresence mode="popLayout">
            <tbody>
              {items.map((f, i) => (
                <motion.tr
                  key={f.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  className="border-t-2 border-black hover:bg-brand-100 transition-colors"
                >
                  <td className="px-4 py-3 max-w-[200px] truncate font-bold">
                    <span className="flex items-center gap-2">
                      {f.contentType.startsWith("image/") && f.url ? (
                        <img src={f.url} alt="" className="w-8 h-8 rounded border border-black object-cover flex-shrink-0" />
                      ) : null}
                      <span className="truncate">{f.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatSize(f.size)}</td>
                  <td className="px-4 py-3">
                    <IconRenderer
                      fileName={f.name}
                      type={f.contentType}
                      icons={{
                        video: <FaVideo />,
                        image: <FaRegImage />,
                        epub: <FaBook />,
                        pdf: <FaRegFilePdf />,
                        zip: <MdFolderZip />,
                        audio: <FaMusic />,
                        other: <GiMagicLamp />,
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {f.access === "private" ? (
                      <span className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-full border border-black">Privado</span>
                    ) : (
                      <span className="bg-brand-yellow text-xs font-bold px-2 py-0.5 rounded-full border border-black">Público</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f.access === "private" ? (
                      <button
                        className="p-1 rounded-lg active:scale-95 hover:shadow active:shadow-inner bg-white"
                        onClick={() => setTokenFor(f)}
                      >
                        <img alt="keys" src="/icons/keys.svg" className="w-6" />
                      </button>
                    ) : f.url ? (
                      <Copy mode="ghost" text={f.url} />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {f.source ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border border-black ${
                        f.source === "mcp" ? "bg-purple-200" : f.source === "api" ? "bg-blue-200" : "bg-brand-yellow"
                      }`}>
                        {f.source}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-md border border-black">
                      {f.storageProviderId ? "Custom" : "Tigris"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {trash ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-md border-2 border-black bg-brand-yellow">
                        {daysUntilPurge(f.deletedAt)} days
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${
                          f.status === "DONE"
                            ? "bg-lime"
                            : f.status === "ERROR"
                            ? "bg-brand-red text-white"
                            : "bg-brand-yellow"
                        }`}
                      >
                        {f.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {trash ? <RestoreButton fileId={f.id} /> : <DeleteButton fileId={f.id} />}
                  </td>
                </motion.tr>
              ))}
              {items.length === 0 && (
                <motion.tr
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <td colSpan={10} className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider">
                    {trash ? "La papelera esta vacia" : "Sube archivos via MCP, SDK o API"}
                  </td>
                </motion.tr>
              )}
            </tbody>
          </AnimatePresence>
        </table>
      </motion.div>

      <AnimatePresence>
        {nextCursor && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4"
          >
            <BrutalButton
              mode="ghost"
              size="chip"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set("cursor", nextCursor);
                setSearchParams(params);
              }}
              className="text-sm px-4 py-1.5"
            >
              Load more
            </BrutalButton>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareTokensModal tokenFor={tokenFor} onClose={() => setTokenFor(null)} />
    </motion.div>
  );
}
