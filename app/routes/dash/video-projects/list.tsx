import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/list";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";

export const meta = () => [
  { title: "Proyectos de video — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const projects = await db.videoProject.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      name: true,
      status: true,
      width: true,
      height: true,
      fps: true,
      scenes: true,
      lastRenderUrl: true,
      updatedAt: true,
    },
  });
  return {
    projects: projects.map((p) => {
      const scenes = Array.isArray(p.scenes) ? (p.scenes as any[]) : [];
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        aspect: `${p.width}×${p.height}`,
        fps: p.fps,
        sceneCount: scenes.length,
        durationSec: scenes.reduce((a, s) => a + (Number(s?.durationSec) || 0), 0),
        lastRenderUrl: p.lastRenderUrl,
        updatedAt: p.updatedAt,
      };
    }),
  };
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Borrador", cls: "bg-gray-100 text-gray-900" },
    rendering: { label: "Renderizando", cls: "bg-blue-100 text-blue-900" },
    ready: { label: "Listo", cls: "bg-green-100 text-green-900" },
    failed: { label: "Falló", cls: "bg-red-100 text-red-900" },
  };
  const m = map[status] || { label: status, cls: "bg-gray-100 text-gray-900" };
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded border border-black ${m.cls}`}>
      {m.label}
    </span>
  );
}

export default function VideoProjectsList() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Proyectos de video</h1>
        <p className="text-gray-600 text-sm mt-1">
          Videos editables por escenas — HTML animado + narración, renderizados a MP4. Se crean y
          editan por API / MCP / SDK.
        </p>
      </header>

      {projects.length === 0 ? (
        <div className="border-2 border-dashed border-black rounded-xl p-12 text-center">
          <div className="text-5xl mb-3">🎞️</div>
          <div className="text-lg font-semibold mb-2">Aún no hay proyectos de video</div>
          <p className="text-gray-600 text-sm">
            Crea uno con <code className="px-1 bg-gray-100 rounded">create_video_project</code>{" "}
            (MCP) o <code className="px-1 bg-gray-100 rounded">POST /api/v2/video-projects</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/dash/video-projects/${p.id}`}
              className="border-2 border-black rounded-xl overflow-hidden bg-white hover:-translate-y-1 transition-transform"
            >
              <div className="aspect-video bg-black border-b-2 border-black relative overflow-hidden">
                {p.lastRenderUrl ? (
                  <video
                    src={p.lastRenderUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
                )}
                <div className="absolute top-2 right-2">{statusBadge(p.status)}</div>
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold line-clamp-1 mb-1">{p.name}</div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {p.sceneCount} esc · {Math.round(p.durationSec)}s · {p.aspect}
                  </span>
                  <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
