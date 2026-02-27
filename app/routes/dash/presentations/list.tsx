import { useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/list";

export const meta = () => [
  { title: "Presentaciones — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const presentations = await db.presentation.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      theme: true,
      createdAt: true,
      slides: true,
    },
  });
  return { presentations };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = String(formData.get("id"));
    const p = await db.presentation.findUnique({ where: { id } });
    if (!p || p.ownerId !== user.id) return { error: "No encontrado" };
    await db.presentation.delete({ where: { id } });
    return { ok: true };
  }
  return { error: "Intent no válido" };
};

export default function PresentationsList() {
  const { presentations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const deleteFetcher = useFetcher();

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black tracking-tight uppercase">
          Presentaciones
        </h1>
        <BrutalButton onClick={() => navigate("/dash/presentations/new")}>
          + Nueva
        </BrutalButton>
      </div>

      {presentations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-16 text-gray-500"
        >
          <p className="text-lg">No tienes presentaciones aún</p>
          <p className="text-sm mt-1">
            Crea una con AI en segundos
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {presentations.map((p, i) => {
              const isDeleting =
                deleteFetcher.state !== "idle" &&
                deleteFetcher.formData?.get("id") === p.id;
              const slideCount = Array.isArray(p.slides)
                ? (p.slides as unknown[]).length
                : 0;

              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className={`border-2 border-black rounded-xl p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isDeleting ? "opacity-50" : ""}`}
                >
                  <Link to={`/dash/presentations/${p.id}`} className="block">
                    <h3 className="font-bold text-lg truncate">{p.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <StatusBadge status={p.status} />
                      <span>{slideCount} slides</span>
                      <span>·</span>
                      <span>{p.theme}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(p.createdAt).toLocaleDateString("es-MX")}
                    </p>
                  </Link>
                  <deleteFetcher.Form method="post" className="mt-3">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      disabled={isDeleting}
                      className="text-xs text-red-600 font-bold hover:underline disabled:opacity-50"
                      onClick={(e) => {
                        if (!confirm("¿Eliminar esta presentación?")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </deleteFetcher.Form>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "PUBLISHED"
      ? "bg-lime border-black text-black"
      : "bg-gray-200 border-black text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${styles}`}>
      {status}
    </span>
  );
}
