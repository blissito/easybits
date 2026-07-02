import { useState } from "react";
import { useLoaderData, useFetcher, Link, data } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import { deleteWorkspace, deleteFile, getFile } from "~/.server/core/operations";
import type { AuthContext } from "~/.server/apiAuth";
import type { Route } from "./+types/workspaces";

export const meta = () => [
  { title: "Workspaces — EasyBits" },
  { name: "robots", content: "noindex" },
];

// Session users act on their own resources with full (ADMIN) scope.
const sessionCtx = (user: any): AuthContext => ({ user, scopes: ["ADMIN"] });

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const workspaces = await db.workspace.findMany({
    where: {
      ownerId: user.id,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    },
    orderBy: { createdAt: "desc" },
  });

  const selectedId = new URL(request.url).searchParams.get("ws");
  let selected = null;
  let files: Array<{ id: string; name: string; size: number; contentType: string; createdAt: Date }> = [];
  if (selectedId) {
    const ws = workspaces.find((w) => w.id === selectedId);
    if (ws) {
      selected = { id: ws.id, name: ws.name, slug: ws.slug };
      files = await db.file.findMany({
        where: { workspaceId: selectedId, ownerId: user.id, status: { not: "DELETED" } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, name: true, size: true, contentType: true, createdAt: true },
      });
    }
  }

  return data({
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      status: w.status,
      usedBytes: w.usedBytes,
      quotaBytes: w.quotaBytes,
      fileCount: w.fileCount,
      createdAt: w.createdAt,
    })),
    selected,
    files,
  });
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = sessionCtx(user);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  try {
    if (intent === "delete-workspace") {
      await deleteWorkspace(ctx, String(formData.get("workspaceId")));
      return data({ ok: true });
    }
    if (intent === "delete-file") {
      await deleteFile(ctx, String(formData.get("fileId")));
      return data({ ok: true });
    }
    if (intent === "read-url") {
      const file = await getFile(ctx, String(formData.get("fileId")));
      return data({ url: file.readUrl });
    }
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    let msg = "Error";
    try {
      msg = JSON.parse(await e.text?.()).error ?? msg;
    } catch {}
    return data({ error: msg }, { status });
  }

  return data({ error: "Intent no válido" }, { status: 400 });
};

export default function WorkspacesPage() {
  const { workspaces, selected, files } = useLoaderData<typeof loader>();
  const deleteWs = useFetcher();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="border-2 border-black rounded-xl p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="text-xl font-bold">Workspaces</h2>
        <p className="text-sm text-gray-600 mt-1">
          Contenedores de archivos con namespace y cuota propia. Cada plataforma
          que integra EasyBits (p. ej. Denik) crea un workspace por cliente.
        </p>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No hay workspaces aún</p>
          <p className="text-sm mt-1">
            Se crean vía API: <code>POST /api/v2/workspaces</code>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {workspaces.map((ws, i) => {
              const isDeleting =
                deleteWs.state !== "idle" &&
                deleteWs.formData?.get("workspaceId") === ws.id;
              const isOpen = selected?.id === ws.id;
              return (
                <motion.div
                  key={ws.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className={`border-2 border-black rounded-xl p-4 space-y-3 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isDeleting ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg truncate">{ws.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                        <code className="text-xs">{ws.slug}</code>
                        <span>·</span>
                        <span>{ws.fileCount} archivos</span>
                        <span>·</span>
                        <StatusBadge status={ws.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        to={isOpen ? "/dash/developer/workspaces" : `/dash/developer/workspaces?ws=${ws.id}`}
                        preventScrollReset
                        className="px-3 py-1.5 text-sm font-bold rounded-lg border-2 border-black bg-white hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
                      >
                        {isOpen ? "Ocultar" : "Ver archivos"}
                      </Link>
                      <WsDelete wsId={ws.id} isDeleting={isDeleting} fetcher={deleteWs} />
                    </div>
                  </div>

                  <UsageBar used={ws.usedBytes} quota={ws.quotaBytes} />

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <FileList files={files} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function UsageBar({ used, quota }: { used: number; quota: number | null }) {
  const pct = quota && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
        <span>{formatSize(used)} usados</span>
        <span>{quota != null ? `de ${formatSize(quota)}` : "sin límite de workspace"}</span>
      </div>
      {quota != null && (
        <div className="h-2.5 w-full rounded-full border-2 border-black bg-white overflow-hidden">
          <div
            className={`h-full ${pct > 90 ? "bg-brand-red" : "bg-lime"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function FileList({ files }: { files: Array<{ id: string; name: string; size: number; contentType: string }> }) {
  if (files.length === 0) {
    return <p className="text-sm text-gray-500 py-3">Este workspace no tiene archivos.</p>;
  }
  return (
    <div className="mt-2 border-t-2 border-black pt-3 space-y-2">
      {files.map((f) => (
        <FileRow key={f.id} file={f} />
      ))}
    </div>
  );
}

function FileRow({ file }: { file: { id: string; name: string; size: number; contentType: string } }) {
  const del = useFetcher();
  const read = useFetcher<{ url?: string }>();
  const [confirm, setConfirm] = useState(false);

  // Open the signed read URL as soon as it comes back.
  if (read.data?.url && typeof window !== "undefined") {
    window.open(read.data.url, "_blank", "noopener");
    read.data.url = undefined;
  }

  const shortName = file.name.split("/").pop() || file.name;
  const isDeleting = del.state !== "idle";

  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${isDeleting ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="font-medium truncate">{shortName}</p>
        <p className="text-xs text-gray-500">
          {formatSize(file.size)} · {file.contentType}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={read.state !== "idle"}
          onClick={() => read.submit({ intent: "read-url", fileId: file.id }, { method: "post" })}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-black bg-white hover:bg-gray-100"
        >
          {read.state !== "idle" ? "…" : "Descargar"}
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setConfirm(true)}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-black text-red-600 bg-white hover:bg-red-50"
        >
          Eliminar
        </button>
      </div>
      <ConfirmDialog
        isOpen={confirm}
        title="Eliminar archivo"
        message="El archivo se moverá a la papelera (retención de 7 días)."
        confirmLabel="Eliminar"
        onConfirm={() => {
          setConfirm(false);
          del.submit({ intent: "delete-file", fileId: file.id }, { method: "post" });
        }}
        onCancel={() => setConfirm(false)}
        destructive
      />
    </div>
  );
}

function WsDelete({ wsId, isDeleting, fetcher }: { wsId: string; isDeleting: boolean; fetcher: ReturnType<typeof useFetcher> }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={isDeleting}
        onClick={() => setConfirm(true)}
        className="px-3 py-1.5 text-sm font-bold rounded-lg border-2 border-black text-red-600 bg-white hover:bg-red-50"
      >
        {isDeleting ? "Eliminando…" : "Eliminar"}
      </button>
      <ConfirmDialog
        isOpen={confirm}
        title="Eliminar workspace"
        message="Se eliminará el workspace y TODOS sus archivos (retención de 7 días). Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          setConfirm(false);
          fetcher.submit({ intent: "delete-workspace", workspaceId: wsId }, { method: "post" });
        }}
        onCancel={() => setConfirm(false)}
        destructive
      />
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "ACTIVE" ? "bg-lime border-black text-black" : "bg-brand-red border-black text-white";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border-2 ${styles}`}>{status}</span>;
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
