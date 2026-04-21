import { useLoaderData, Link, useNavigate } from "react-router";
import type { Route } from "./+types/list";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { listVideoGenerations } from "~/.server/core/videoOperations";
import { listCharacters } from "~/.server/core/characterOperations";
import { BrutalButton } from "~/components/common/BrutalButton";

export const meta = () => [
  { title: "Videos — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const [videos, characters] = await Promise.all([
    listVideoGenerations(user.id, 50),
    listCharacters(user.id),
  ]);

  // Still files are stored public; fetch their public `url` in a single query
  // so the list renders thumbnails without N round-trips.
  const stillIds = videos.map((v) => v.stillFileId).filter((x): x is string => !!x);
  const stills = stillIds.length
    ? await db.file.findMany({
        where: { id: { in: stillIds } },
        select: { id: true, url: true },
      })
    : [];
  const stillUrlById = new Map(stills.map((f) => [f.id, f.url]));

  const videosWithThumb = videos.map((v) => ({
    ...v,
    thumbnailUrl: v.stillFileId ? stillUrlById.get(v.stillFileId) || null : null,
  }));

  return { videos: videosWithThumb, characters };
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "En cola", cls: "bg-yellow-100 text-yellow-900" },
    enhancing: { label: "Pensando toma", cls: "bg-yellow-100 text-yellow-900" },
    generating_still: { label: "Generando foto", cls: "bg-blue-100 text-blue-900" },
    animating: { label: "Animando", cls: "bg-blue-100 text-blue-900" },
    uploading: { label: "Subiendo", cls: "bg-blue-100 text-blue-900" },
    completed: { label: "Listo", cls: "bg-green-100 text-green-900" },
    failed: { label: "Falló", cls: "bg-red-100 text-red-900" },
  };
  const m = map[status] || { label: status, cls: "bg-gray-100 text-gray-900" };
  return <span className={`px-2 py-1 text-xs font-semibold rounded border border-black ${m.cls}`}>{m.label}</span>;
}

export default function VideosList() {
  const { videos, characters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Videos</h1>
          <p className="text-gray-600 text-sm mt-1">
            Clips generados con IA. Personajes recurrentes mantienen la misma cara entre escenas.
          </p>
        </div>
        <BrutalButton onClick={() => navigate("/dash/videos/new")}>+ Nuevo video</BrutalButton>
      </header>

      {characters.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Personajes guardados</h2>
            <Link to="/dash/characters" className="text-sm underline">Administrar</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {characters.map((c) => (
              <Link
                key={c.id}
                to={`/dash/videos/new?character=${c.slug}`}
                className="flex-shrink-0 w-36 border-2 border-black rounded-xl p-3 bg-white hover:-translate-y-1 transition-transform"
              >
                <div className="aspect-square rounded-lg overflow-hidden border-2 border-black mb-2 bg-gray-100">
                  {c.referenceImageUrls[0] && (
                    <img src={c.referenceImageUrls[0]} alt={c.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-xs text-gray-500 truncate">@{c.slug}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {videos.length === 0 ? (
        <div className="border-2 border-dashed border-black rounded-xl p-12 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <div className="text-lg font-semibold mb-2">Aún no has generado videos</div>
          <p className="text-gray-600 text-sm mb-4">Describe una escena. Nosotros nos encargamos de la dirección.</p>
          <BrutalButton onClick={() => navigate("/dash/videos/new")}>Generar primer video</BrutalButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <Link
              key={v.id}
              to={`/dash/videos/${v.id}`}
              className="border-2 border-black rounded-xl overflow-hidden bg-white hover:-translate-y-1 transition-transform"
            >
              <div className="aspect-video bg-gray-100 border-b-2 border-black relative overflow-hidden">
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎥</div>
                )}
                <div className="absolute top-2 right-2">{statusBadge(v.status)}</div>
              </div>
              <div className="p-3">
                <div className="text-sm font-medium line-clamp-2 mb-1">{v.prompt}</div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {v.character ? `@${v.character.slug} · ` : ""}
                    {v.duration}s · {v.aspectRatio}
                  </span>
                  <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
