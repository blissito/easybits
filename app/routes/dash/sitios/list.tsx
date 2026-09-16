import { Link, useLoaderData, useNavigate } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { listSites } from "~/.server/core/siteOperations";
import type { Route } from "./+types/list";

export const meta = () => [
  { title: "Sitios — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const sites = await listSites({ user, scopes: ["READ"] } as AuthContext);
  return { sites };
};

export default function SitesList() {
  const { sites } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex items-center justify-between mb-6 sm:mb-10 gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase">Sitios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Describe tu sitio y un agente lo construye · {sites.length} {sites.length === 1 ? "sitio" : "sitios"}
          </p>
        </div>
        <BrutalButton onClick={() => navigate("/dash/sitios/new")}>+ Nuevo</BrutalButton>
      </div>

      {sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 border-2 border-dashed border-gray-300 rounded-2xl">
          <div className="text-6xl mb-4">🌐</div>
          <p className="text-lg font-bold text-gray-700">Aún no tienes sitios</p>
          <p className="text-sm text-gray-500 mt-1 mb-6">Un sitio estático va incluido en tu plan; una web app corre en su propia máquina.</p>
          <BrutalButton onClick={() => navigate("/dash/sitios/new")}>Crear sitio</BrutalButton>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Link
              key={s.id}
              to={`/dash/sitios/${s.id}`}
              className="block border-2 border-black rounded-2xl bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold truncate">{s.name}</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-2 ${s.kind === "webapp" ? "border-brand-500 text-brand-500" : "border-gray-300 text-gray-500"}`}>
                  {s.kind === "webapp" ? "Web app" : "Estático"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2 truncate">{s.url ?? "sin publicar"}</p>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
