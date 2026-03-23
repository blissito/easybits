import { useLoaderData, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/list";
import { buildSingleThemeCss, buildCustomTheme, type CustomColors } from "@easybits.cloud/html-tailwind-generator";

export const meta = () => [
  { title: "Documentos — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";

  // Use raw aggregation to avoid fetching full sections JSON (can be MBs per doc)
  const pipeline: Record<string, unknown>[] = [
    { $match: { ownerId: { $oid: user.id }, version: 4 } },
    { $sort: { createdAt: -1 } },
    ...(!all ? [{ $limit: 12 }] : []),
    {
      $project: {
        name: 1,
        status: 1,
        prompt: 1,
        metadata: 1,
        createdAt: 1,
        updatedAt: 1,
        pageCount: {
          $size: {
            $filter: {
              input: { $ifNull: ["$sections", []] },
              as: "s",
              cond: {
                $and: [
                  { $ne: ["$$s.id", "__grapes_css__"] },
                  { $ne: ["$$s.label", "__css__"] },
                ],
              },
            },
          },
        },
        coverHtml: {
          $let: {
            vars: {
              sorted: {
                $sortArray: {
                  input: {
                    $filter: {
                      input: { $ifNull: ["$sections", []] },
                      as: "s",
                      cond: {
                        $and: [
                          { $ne: ["$$s.id", "__grapes_css__"] },
                          { $ne: ["$$s.label", "__css__"] },
                        ],
                      },
                    },
                  },
                  sortBy: { order: 1 },
                },
              },
            },
            in: { $ifNull: [{ $arrayElemAt: ["$$sorted.html", 0] }, ""] },
          },
        },
      },
    },
  ];

  const raw = (await db.landing.aggregateRaw({ pipeline })) as unknown as Array<{
    _id: { $oid: string };
    name: string;
    status: string;
    prompt: string;
    metadata?: Record<string, unknown>;
    createdAt: { $date: string };
    updatedAt?: { $date: string };
    pageCount: number;
    coverHtml: string;
  }>;

  const items = raw.map((d) => {
    const meta = (d.metadata || {}) as Record<string, unknown>;
    const theme = (meta.theme as string) || "minimal";
    const customColors = meta.customColors as CustomColors | undefined;
    return {
      id: d._id.$oid,
      name: d.name,
      status: d.status,
      prompt: d.prompt,
      pageCount: d.pageCount,
      coverHtml: d.coverHtml,
      theme,
      customColors: theme === "custom" ? customColors : undefined,
      createdAt: d.createdAt.$date,
      updatedAt: d.updatedAt?.$date ?? d.createdAt.$date,
    };
  });

  // Total count for "load all" button
  const total = all
    ? items.length
    : await db.landing.count({ where: { ownerId: user.id, version: 4 } });

  return { items, total, showingAll: all || items.length >= total };
};

export default function DocumentsList() {
  const { items, total, showingAll } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex items-center justify-between mb-6 sm:mb-10 gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase">
            Documentos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Transforma archivos en PDFs hermosos &middot; {total}{" "}
            {total === 1 ? "documento" : "documentos"}
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
          className="flex flex-col items-center justify-center py-12 sm:py-24 border-2 border-dashed border-gray-300 rounded-2xl"
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
                  className="group block border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 overflow-hidden max-w-[280px] sm:max-w-none mx-auto sm:mx-0"
                >
                  {item.coverHtml ? (
                    <DocThumb html={item.coverHtml} theme={item.theme} customColors={item.customColors} />
                  ) : (
                    <div className="h-3 w-full bg-gradient-to-r from-orange-400 to-red-500" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-sm truncate group-hover:text-brand-600 transition-colors">
                        {item.name}
                      </h3>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
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

      {!showingAll && items.length > 0 && (
        <div className="flex justify-center mt-8">
          <BrutalButton
            onClick={() => navigate("?all=1")}
          >
            Cargar todos ({total})
          </BrutalButton>
        </div>
      )}
    </article>
  );
}

function buildThumbHtml(html: string, themeCssData: { css: string; tailwindConfig: string }): string {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"><\/script>
${themeCssData.tailwindConfig ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; width: 8.5in; overflow: hidden; }
${themeCssData.css || ""}
</style>
</head><body>${html}</body></html>`;
}

function DocThumb({ html, theme, customColors }: { html: string; theme: string; customColors?: CustomColors }) {
  const themeCssData = (() => {
    if (theme === "custom" && customColors) {
      const t = buildCustomTheme(customColors);
      const css = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(theme);
  })();

  const srcDoc = buildThumbHtml(html, themeCssData);

  return (
    <div
      className="w-full bg-white relative overflow-hidden"
      style={{ aspectRatio: "8.5 / 11" }}
    >
      <iframe
        srcDoc={srcDoc}
        className="absolute top-0 left-0 border-none pointer-events-none"
        style={{
          width: "8.5in",
          height: "11in",
          transform: "scale(var(--thumb-scale))",
          transformOrigin: "top left",
        }}
        ref={(el) => {
          if (!el) return;
          const parent = el.parentElement;
          if (!parent) return;
          const ro = new ResizeObserver(([entry]) => {
            const scale = entry.contentRect.width / (8.5 * 96);
            el.style.setProperty("--thumb-scale", String(scale));
          });
          ro.observe(parent);
        }}
        title="Preview"
        loading="lazy"
        tabIndex={-1}
      />
    </div>
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
