import { useLoaderData, Link, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { getPostStats } from "~/.server/blog/postViews";
import type { Route } from "./+types/blog";

export const meta = () => [
  { title: "Blog — Admin — EasyBits" },
  { name: "robots", content: "noindex" },
];

const RANGES = {
  month: "Este mes",
  d30: "Últimos 30 días",
  d7: "Últimos 7 días",
} as const;
type RangeKey = keyof typeof RANGES;

const since = (range: RangeKey): Date => {
  const now = new Date();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = range === "d7" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  // El layout ya guarda, pero todas las hijas repiten la comprobación.
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isSuperAdmin = adminEmails.includes(user.email?.toLowerCase() || "");
  const isRoleAdmin = user.roles.includes("Admin");
  if (!isSuperAdmin && !isRoleAdmin) return redirect("/dash");

  const url = new URL(request.url);
  const param = url.searchParams.get("range");
  const range: RangeKey = param === "d7" || param === "d30" ? param : "month";

  return { stats: await getPostStats(since(range)), range };
};

const mmss = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function AdminBlog() {
  const { stats, range } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const totalViews = stats.reduce((sum, s) => sum + s.views, 0);
  const totalMeasured = stats.reduce((sum, s) => sum + s.measured, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Lecturas del blog</h2>
          <p className="text-sm text-gray-500">
            {totalViews} lectura{totalViews === 1 ? "" : "s"} · {totalMeasured} con
            medición completa
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(RANGES) as RangeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSearchParams({ range: key })}
              className={`text-sm px-3 py-1.5 rounded-lg border-2 border-black ${
                range === key ? "bg-black text-white" : "bg-white"
              }`}
            >
              {RANGES[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-black rounded-xl overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black bg-gray-50">
              <th className="text-left p-3 font-bold">Post</th>
              <th className="text-right p-3 font-bold">Lecturas</th>
              <th className="text-right p-3 font-bold">Llegó al final</th>
              <th className="text-right p-3 font-bold">Tiempo (real / est.)</th>
              <th className="text-left p-3 font-bold">De dónde</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr
                key={s.slug}
                className={i < stats.length - 1 ? "border-b border-gray-200" : ""}
              >
                <td className="p-3">
                  <Link
                    to={`/blog/${s.slug}`}
                    className="font-medium hover:underline"
                    target="_blank"
                  >
                    {s.title}
                  </Link>
                  {s.date && (
                    <span className="block text-xs text-gray-400">{s.date}</span>
                  )}
                </td>
                <td className="p-3 text-right font-black">{s.views}</td>
                <td className="p-3 text-right">
                  {/* null = todavía no hay ninguna lectura cerrada. Un 0% diría
                      "nadie lo terminó", que es una afirmación distinta. */}
                  {s.completedPct === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <>
                      {s.completedPct}%
                      <span className="block text-xs text-gray-400">
                        de {s.measured}
                      </span>
                    </>
                  )}
                </td>
                <td className="p-3 text-right">
                  {s.medianSeconds === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <>
                      {mmss(s.medianSeconds)}
                      {/* El estimado al lado es la comparación que dice si se
                          leyó o se ojeó. */}
                      <span className="block text-xs text-gray-400">
                        est. {s.readingTimeMin}:00
                      </span>
                    </>
                  )}
                </td>
                <td className="p-3 text-xs text-gray-600">
                  {s.topSources.map((f) => `${f.source} ${f.views}`).join(" · ") || "—"}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  Sin lecturas en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        La mediana de tiempo cuenta solo con la pestaña al frente. "Llegó al final"
        se mide contra el fin del artículo, no contra el fondo de la página, y se
        calcula sobre las lecturas que alcanzaron a reportar — una que se fue sin
        avisar es un dato ausente, no un abandono.
      </p>
    </div>
  );
}
