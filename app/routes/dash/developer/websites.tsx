import { useState } from "react";
import {
  useLoaderData,
  useFetcher,
  data,
  Link,
} from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/websites";
import { FolderDropZone } from "~/components/FolderDropZone";
import { Copy } from "~/components/common/Copy";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const websites = await db.website.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Get user's API key for uploads (or create a temporary session-based approach)
  const apiKey = await db.apiKey.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    select: { prefix: true, hashedKey: true },
  });

  return data({ websites, hasApiKey: !!apiKey });
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    if (!name) return data({ error: "Nombre requerido" }, { status: 400 });

    let slug = slugify(name);
    // Ensure unique slug
    const existing = await db.website.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const website = await db.website.create({
      data: {
        name,
        slug,
        ownerId: user.id,
        prefix: "", // will be set after creation with the id
      },
    });

    await db.website.update({
      where: { id: website.id },
      data: { prefix: `sites/${website.id}/` },
    });

    return data({ ok: true, website });
  }

  if (intent === "delete") {
    const websiteId = String(formData.get("websiteId"));
    const website = await db.website.findUnique({ where: { id: websiteId } });
    if (!website || website.ownerId !== user.id) {
      return data({ error: "No encontrado" }, { status: 404 });
    }

    // Delete associated files from DB (soft delete)
    await db.file.updateMany({
      where: {
        ownerId: user.id,
        name: { startsWith: `sites/${websiteId}/` },
      },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    await db.website.delete({ where: { id: websiteId } });
    return data({ ok: true });
  }

  return data({ error: "Intent no válido" }, { status: 400 });
};

export default function WebsitesPage() {
  const { websites, hasApiKey } = useLoaderData<typeof loader>();
  const [showCreate, setShowCreate] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const fetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://easybits.cloud";

  return (
    <div className="space-y-6">
      {!hasApiKey && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
          <p className="font-bold">Se requiere un API Key</p>
          <p>
            Para subir archivos necesitas un API Key activo.{" "}
            <Link to="/dash/developer" className="underline font-bold">
              Crear API Key →
            </Link>
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Tus sitios</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
        >
          + Nuevo sitio
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border-2 border-black p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Nuevo sitio</h3>
            <fetcher.Form
              method="post"
              onSubmit={() => setShowCreate(false)}
            >
              <input type="hidden" name="intent" value="create" />
              <label className="block mb-4">
                <span className="text-sm font-bold">Nombre del sitio</span>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Mi landing page"
                  className="w-full mt-1 px-3 py-2 border-2 border-black rounded-xl"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border-2 border-black rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-bold rounded-xl"
                >
                  Crear
                </button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      )}

      {/* Websites list */}
      {websites.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No tienes sitios aún</p>
          <p className="text-sm mt-1">Crea uno para empezar a publicar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {websites.map((site) => (
            <div
              key={site.id}
              className="border-2 border-black rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">{site.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="relative inline-flex items-center gap-1">
                      <a
                        href={`/s/${site.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        /s/{site.slug}
                      </a>
                      <Copy
                        text={`${baseUrl}/s/${site.slug}`}
                        mode="ghost"
                        className="static p-0"
                      />
                    </span>
                    <span>·</span>
                    <span>{site.fileCount} archivos</span>
                    <span>·</span>
                    <span>{formatSize(site.totalSize)}</span>
                    <span>·</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        site.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : site.status === "DEPLOYING"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {site.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/s/${site.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 border-2 border-black rounded-xl text-sm font-bold hover:bg-gray-100"
                  >
                    Visitar ↗
                  </a>
                  <button
                    onClick={() =>
                      setDeployingId(deployingId === site.id ? null : site.id)
                    }
                    className="px-3 py-1 bg-brand-500 text-white border-2 border-black rounded-xl text-sm font-bold"
                  >
                    Deploy
                  </button>
                  <deleteFetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="websiteId" value={site.id} />
                    <button
                      type="submit"
                      className="px-3 py-1 border-2 border-red-400 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50"
                      onClick={(e) => {
                        if (!confirm("¿Eliminar este sitio y todos sus archivos?")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </deleteFetcher.Form>
                </div>
              </div>

              {deployingId === site.id && (
                <DeployZone websiteId={site.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeployZone({ websiteId }: { websiteId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 space-y-3">
        <label className="block">
          <span className="text-sm font-bold">API Key (para autenticar uploads)</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="eb_..."
            className="w-full mt-1 px-3 py-2 border-2 border-black rounded-xl text-sm"
          />
        </label>
        <button
          disabled={!apiKey}
          onClick={() => setStarted(true)}
          className="px-4 py-2 bg-black text-white font-bold rounded-xl text-sm disabled:opacity-50"
        >
          Listo, arrastra tu carpeta
        </button>
      </div>
    );
  }

  return (
    <FolderDropZone
      websiteId={websiteId}
      apiKey={apiKey}
      onComplete={() => {
        // Revalidate to show updated stats
        window.location.reload();
      }}
    />
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
