import { useLoaderData, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { buildRevealHtml, type Slide } from "~/lib/buildRevealHtml";
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
      updatedAt: true,
      slides: true,
      prompt: true,
    },
  });

  // Build thumbnail HTML for first slide of each presentation
  const items = presentations.map((p) => {
    const slides = Array.isArray(p.slides) ? (p.slides as unknown as Slide[]) : [];
    const firstSlideHtml = slides.length > 0
      ? buildRevealHtml([{ ...slides[0], order: 0 }], p.theme ?? "black")
      : null;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      theme: p.theme,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      slideCount: slides.length,
      prompt: p.prompt,
      firstSlideHtml,
    };
  });

  return { items };
};

export default function PresentationsList() {
  const { items } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <article className="pt-20 px-8 pb-24 md:pl-36 w-full max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            Presentaciones
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} {items.length === 1 ? "presentación" : "presentaciones"}
          </p>
        </div>
        <BrutalButton onClick={() => navigate("/dash/presentations/new")}>
          + Nueva
        </BrutalButton>
      </div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-gray-300 rounded-2xl"
        >
          <div className="text-6xl mb-4">🎨</div>
          <p className="text-lg font-bold text-gray-700">No tienes presentaciones aún</p>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Crea tu primera presentación con AI en segundos
          </p>
          <BrutalButton onClick={() => navigate("/dash/presentations/new")}>
            Crear presentación
          </BrutalButton>
        </motion.div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {items.map((p, i) => (
              <PresentationCard key={p.id} item={p} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </article>
  );
}

function PresentationCard({
  item,
  index,
}: {
  item: {
    id: string;
    name: string;
    status: string;
    theme: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    slideCount: number;
    prompt: string | null;
    firstSlideHtml: string | null;
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
        to={`/dash/presentations/${item.id}`}
        className="group block border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 overflow-hidden"
      >
        {/* Thumbnail preview */}
        <div className="aspect-video bg-gray-900 relative overflow-hidden">
          {item.firstSlideHtml ? (
            <iframe
              srcDoc={item.firstSlideHtml}
              sandbox="allow-scripts allow-same-origin"
              className="pointer-events-none border-0 absolute top-0 left-0 w-[960px] h-[540px] origin-top-left"
              style={{ transform: `scale(var(--thumb-scale, 0.35))` }}
              tabIndex={-1}
              loading="lazy"
              ref={(el) => {
                if (!el) return;
                const parent = el.parentElement;
                if (!parent) return;
                const ro = new ResizeObserver(([entry]) => {
                  parent.style.setProperty(
                    "--thumb-scale",
                    String(entry.contentRect.width / 960)
                  );
                });
                ro.observe(parent);
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
          )}
          {/* Status overlay */}
          <div className="absolute top-3 right-3">
            <StatusBadge status={item.status} />
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="font-black text-lg truncate group-hover:text-brand-600 transition-colors">
            {item.name}
          </h3>
          {item.prompt && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
              {item.prompt}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008M6 10h.008M6 14h.008M10 6h8M10 10h8M10 14h8" />
              </svg>
              {item.slideCount} slides
            </span>
            <span>·</span>
            <span className="capitalize">{item.theme ?? "black"}</span>
            <span className="ml-auto">
              {new Date(item.updatedAt ?? item.createdAt).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
              })}
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
    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/80 backdrop-blur-sm border border-gray-300 text-gray-500">
      Borrador
    </span>
  );
}
