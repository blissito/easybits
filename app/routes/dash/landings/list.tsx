import { useLoaderData, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/list";

export const meta = () => [
  { title: "Landings — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const landings = await db.landing.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      theme: true,
      prompt: true,
      sections: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const items = landings.map((l) => {
    const sections = Array.isArray(l.sections) ? l.sections : [];
    return {
      id: l.id,
      name: l.name,
      status: l.status,
      theme: l.theme,
      prompt: l.prompt,
      sectionCount: sections.length,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  });

  return { items };
};

export default function LandingsList() {
  const { items } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-7xl">
      {/* Deprecation alert */}
      <div className="mb-8 p-6 bg-yellow-50 border-4 border-yellow-400 rounded-2xl shadow-[4px_4px_0_#000]">
        <div className="flex items-start gap-4">
          <span className="text-4xl">&#9888;&#65039;</span>
          <div>
            <h2 className="text-2xl font-black text-yellow-800 mb-2">
              Landings v1 sera descontinuado
            </h2>
            <p className="text-yellow-700 font-bold">
              Esta version del editor de landings sera eliminada proximamente.
              Los trabajos guardados aqui <strong>NO se migraran</strong> a la nueva version.
            </p>
            <p className="text-yellow-700 mt-2">
              Usa <a href="/dash/landings2" className="underline font-black text-yellow-900 hover:text-black">Landings v2</a> para
              crear nuevas landings con 18+ bloques, charts, diagramas SVG y mas.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            Landings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} {items.length === 1 ? "landing" : "landings"}
          </p>
        </div>
        <BrutalButton onClick={() => navigate("/dash/landings/new")}>
          + Nueva
        </BrutalButton>
      </div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-gray-300 rounded-2xl"
        >
          <div className="text-6xl mb-4">🚀</div>
          <p className="text-lg font-bold text-gray-700">
            No tienes landings aún
          </p>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Crea tu primera landing page con AI en segundos
          </p>
          <BrutalButton onClick={() => navigate("/dash/landings/new")}>
            Crear landing
          </BrutalButton>
        </motion.div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => (
              <LandingCard key={item.id} item={item} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </article>
  );
}

function LandingCard({
  item,
  index,
}: {
  item: {
    id: string;
    name: string;
    status: string;
    theme: string;
    prompt: string;
    sectionCount: number;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  index: number;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
    >
      <Link
        to={`/dash/landings/${item.id}`}
        className="group block border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 overflow-hidden"
      >
        {/* Theme color strip */}
        <div className="h-3 w-full" style={{ background: getThemeAccent(item.theme) }} />

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
            <span>{item.sectionCount} secciones</span>
            <span>·</span>
            <span className="capitalize">{item.theme}</span>
            <span className="ml-auto">
              {new Date(item.updatedAt ?? item.createdAt).toLocaleDateString(
                "es-MX",
                { day: "numeric", month: "short" }
              )}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
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

function getThemeAccent(theme: string): string {
  const map: Record<string, string> = {
    modern: "#6366f1",
    dark: "#38bdf8",
    brutalist: "#000000",
    minimal: "#18181b",
    colorful: "#d946ef",
  };
  return map[theme] || "#6366f1";
}
