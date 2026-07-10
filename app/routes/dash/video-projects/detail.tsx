import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/detail";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { data } from "react-router";

export const meta = () => [
  { title: "Proyecto de video — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const p = await db.videoProject.findUnique({ where: { id: params.id } });
  if (!p || p.ownerId !== user.id) throw data({ error: "Not found" }, { status: 404 });
  const scenes = Array.isArray(p.scenes) ? (p.scenes as any[]) : [];
  return {
    project: {
      id: p.id,
      name: p.name,
      status: p.status,
      aspect: `${p.width}×${p.height}`,
      fps: p.fps,
      theme: p.theme,
      lastRenderUrl: p.lastRenderUrl,
      lastRenderMs: p.lastRenderMs,
      failReason: p.failReason,
      hasAudio: !!p.audioAssetUrl,
      updatedAt: p.updatedAt,
      scenes: scenes.map((s, i) => ({
        id: s.id,
        order: s.order ?? i,
        label: s.label || `Scene ${i + 1}`,
        durationSec: Number(s.durationSec) || 0,
        narration: s.narration || null,
      })),
    },
  };
};

export default function VideoProjectDetail() {
  const { project } = useLoaderData<typeof loader>();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link to="/dash/video-projects" className="text-sm underline">
        ← Proyectos de video
      </Link>

      <header className="flex items-start justify-between mt-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {project.scenes.length} escenas · {project.aspect} · {project.fps}fps · tema{" "}
            {project.theme}
            {project.hasAudio ? " · música" : ""}
          </p>
        </div>
        <span className="px-2 py-1 text-xs font-semibold rounded border border-black bg-gray-100">
          {project.status}
        </span>
      </header>

      {project.lastRenderUrl ? (
        <div className="border-2 border-black rounded-xl overflow-hidden bg-black mb-6">
          <video
            src={project.lastRenderUrl}
            controls
            playsInline
            className="w-full max-h-[70vh] object-contain bg-black mx-auto"
          />
        </div>
      ) : (
        <div className="border-2 border-dashed border-black rounded-xl p-10 text-center mb-6">
          <div className="text-4xl mb-2">🎬</div>
          <div className="text-sm text-gray-600">
            Sin render todavía. Usa <code className="px-1 bg-gray-100 rounded">render_video_project</code>{" "}
            (MCP) o <code className="px-1 bg-gray-100 rounded">POST /video-projects/{project.id}/render</code>.
          </div>
          {project.failReason && (
            <div className="text-xs text-red-700 mt-3">Último error: {project.failReason}</div>
          )}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Escenas</h2>
        <ol className="space-y-2">
          {project.scenes.map((s) => (
            <li
              key={s.id}
              className="border-2 border-black rounded-lg p-3 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {s.order + 1}. {s.label}
                </div>
                {s.narration && (
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">🔊 {s.narration}</div>
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">{s.durationSec}s</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
