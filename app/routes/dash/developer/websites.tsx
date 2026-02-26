import { useState } from "react";
import {
  useLoaderData,
  useFetcher,
  useRevalidator,
  data,
} from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/websites";

export const meta = () => [
  { title: "Sitios Web — EasyBits" },
  { name: "robots", content: "noindex" },
];
import { FolderDropZone, type CreatedWebsite } from "~/components/FolderDropZone";
import { Copy } from "~/components/common/Copy";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const websites = await db.website.findMany({
    where: {
      ownerId: user.id,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    },
    orderBy: { createdAt: "desc" },
  });

  return data({ websites });
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const websiteId = String(formData.get("websiteId"));
    const website = await db.website.findUnique({ where: { id: websiteId } });
    if (!website || website.ownerId !== user.id) {
      return data({ error: "No encontrado" }, { status: 404 });
    }

    await db.file.updateMany({
      where: {
        ownerId: user.id,
        name: { startsWith: `sites/${websiteId}/` },
        status: { not: "DELETED" },
      },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    await db.website.update({
      where: { id: websiteId },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    return data({ ok: true });
  }

  return data({ error: "Intent no válido" }, { status: 400 });
};

export default function WebsitesPage() {
  const { websites } = useLoaderData<typeof loader>();
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [newSite, setNewSite] = useState<CreatedWebsite | null>(null);
  const deleteFetcher = useFetcher();
  const revalidator = useRevalidator();

  const siteUrl = (slug: string) => `https://${slug}.easybits.cloud`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Hero drop area */}
      <div className="border-2 border-black rounded-xl p-6 space-y-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="text-center mb-2">
          <h2 className="text-xl font-bold">Deploy a new site</h2>
          <p className="text-sm text-gray-600">
            Arrastra tu carpeta de build — el sitio se crea automáticamente
          </p>
        </div>
        <FolderDropZone
          onWebsiteCreated={(website) => {
            setNewSite(website);
          }}
          onComplete={() => {
            revalidator.revalidate();
          }}
        />
        <AnimatePresence>
          {newSite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 bg-lime border-2 border-black rounded-xl p-3 text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <span className="font-bold">{newSite.name}</span>
                <a
                  href={siteUrl(newSite.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {newSite.slug}.easybits.cloud
                </a>
                <Copy text={siteUrl(newSite.slug)} mode="ghost" className="static p-0" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Websites list */}
      <div>
        <h2 className="text-xl font-bold mb-4">Tus sitios</h2>
        {websites.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center py-12 text-gray-500"
          >
            <p className="text-lg">No tienes sitios aún</p>
            <p className="text-sm mt-1">Arrastra una carpeta arriba para publicar</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {websites.map((site, i) => {
                const isDeleting =
                  deleteFetcher.state !== "idle" &&
                  deleteFetcher.formData?.get("websiteId") === site.id;

                return (
                  <motion.div
                    key={site.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className={`border-2 border-black rounded-xl p-4 space-y-3 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isDeleting ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{site.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="relative inline-flex items-center gap-1">
                            <a
                              href={siteUrl(site.slug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {site.slug}.easybits.cloud
                            </a>
                            <Copy
                              text={siteUrl(site.slug)}
                              mode="ghost"
                              className="static p-0"
                            />
                          </span>
                          <span>·</span>
                          <span>{site.fileCount} archivos</span>
                          <span>·</span>
                          <span>{formatSize(site.totalSize)}</span>
                          <span>·</span>
                          <StatusBadge status={site.status} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <motion.a
                          href={siteUrl(site.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          whileTap={{ scale: 0.95 }}
                          className="px-3 py-1 border-2 border-black rounded-xl text-sm font-bold hover:bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                        >
                          Visitar
                        </motion.a>
                        <motion.button
                          onClick={() =>
                            setDeployingId(deployingId === site.id ? null : site.id)
                          }
                          whileTap={{ scale: 0.95 }}
                          className="px-3 py-1 bg-brand-500 text-white border-2 border-black rounded-xl text-sm font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                        >
                          Re-deploy
                        </motion.button>
                        <deleteFetcher.Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="websiteId" value={site.id} />
                          <motion.button
                            type="submit"
                            disabled={isDeleting}
                            whileTap={{ scale: 0.95 }}
                            className="px-3 py-1 border-2 border-black text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                            onClick={(e) => {
                              if (!confirm("¿Eliminar este sitio y todos sus archivos?")) {
                                e.preventDefault();
                              }
                            }}
                          >
                            {isDeleting ? "Eliminando..." : "Eliminar"}
                          </motion.button>
                        </deleteFetcher.Form>
                      </div>
                    </div>

                    <AnimatePresence>
                      {deployingId === site.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <FolderDropZone
                            websiteId={site.id}
                            compact
                            onComplete={() => {
                              setDeployingId(null);
                              revalidator.revalidate();
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "ACTIVE"
      ? "bg-lime border-black text-black"
      : status === "DEPLOYING"
      ? "bg-brand-yellow border-black text-black"
      : "bg-brand-red border-black text-white";

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-bold border-2 ${styles}`}
    >
      {status}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
