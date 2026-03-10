import { useLoaderData, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/list";
import type { Section3 } from "~/lib/landing3/types";

export const meta = () => [
  { title: "Documentos — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const documents = await db.landing.findMany({
    where: { ownerId: user.id, version: 4 },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      prompt: true,
      sections: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const items = documents.map((d) => {
    const sections = Array.isArray(d.sections) ? d.sections : [];
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      prompt: d.prompt,
      pageCount: sections.length,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  });

  return { items };
};

export default function DocumentsList() {
  const { items } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-7xl">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            Documentos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Transforma archivos en PDFs hermosos &middot; {items.length}{" "}
            {items.length === 1 ? "documento" : "documentos"}
          </p>
        </div>
        <BrutalButton onClick={() => navigate("/dash/documents/new")}>
          + Nuevo
        </BrutalButton>
      </div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-gray-300 rounded-2xl"
        >
          <div className="text-6xl mb-4">&#128196;</div>
          <p className="text-lg font-bold text-gray-700">
            No tienes documentos a&uacute;n
          </p>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Sube archivos (docx, xlsx, pdf, txt, md) y la AI los transforma en
            p&aacute;ginas hermosas tama&ntilde;o carta
          </p>
          <BrutalButton onClick={() => navigate("/dash/documents/new")}>
            Crear documento
          </BrutalButton>
        </motion.div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
              >
                <Link
                  to={`/dash/documents/${item.id}`}
                  className="group block border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 overflow-hidden"
                >
                  <div className="h-3 w-full bg-gradient-to-r from-orange-400 to-red-500" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-lg truncate group-hover:text-brand-600 transition-colors">
                        {item.name}
                      </h3>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.prompt && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-4 text-xs text-gray-400">
                      <span>
                        {item.pageCount}{" "}
                        {item.pageCount === 1 ? "p\u00e1gina" : "p\u00e1ginas"}
                      </span>
                      <span className="ml-auto">
                        {new Date(
                          item.updatedAt ?? item.createdAt
                        ).toLocaleDateString("es-MX", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-lime border-2 border-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
        Live
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 border border-gray-300 text-gray-500">
      Borrador
    </span>
  );
}
