import { useState } from "react";
import { useLoaderData, useNavigate, Link } from "react-router";
import type { Route } from "./+types/detail";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { getVideoGeneration } from "~/.server/core/videoOperations";
import { getClientForFile, getReadClientForPlatformFile } from "~/.server/storage";
import { BrutalButton } from "~/components/common/BrutalButton";

export const meta = () => [
  { title: "Video — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  if (!params.id) throw new Response("Not found", { status: 404 });

  const gen = await getVideoGeneration(params.id, user.id);

  async function fileReadUrl(fileId: string | null | undefined): Promise<string | null> {
    if (!fileId) return null;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || file.status === "DELETED") return null;
    if (file.access === "public" && file.url) return file.url;
    const client = file.storageProviderId
      ? await getClientForFile(file.storageProviderId, user.id)
      : getReadClientForPlatformFile(file);
    return client.getReadUrl(file.storageKey);
  }

  const [videoUrl, stillUrl] = await Promise.all([
    fileReadUrl(gen.videoFileId),
    fileReadUrl(gen.stillFileId),
  ]);

  return { gen, videoUrl, stillUrl };
};

export default function VideoDetail() {
  const { gen, videoUrl, stillUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm("¿Borrar este video? (Solo se borra el registro, los archivos persisten).")) return;
    setDeleting(true);
    const res = await fetch(`/api/v2/videos/${gen.id}`, { method: "DELETE" });
    if (res.ok) navigate("/dash/videos");
    else { setDeleting(false); alert("No se pudo borrar"); }
  }

  const regenerateUrl = `/dash/videos/new?${new URLSearchParams({
    ...(gen.character ? { character: gen.character.slug } : {}),
  }).toString()}`;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <button onClick={() => navigate("/dash/videos")} className="text-sm text-gray-600 hover:underline">
          ← Videos
        </button>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {gen.status === "completed" && videoUrl ? (
            <video src={videoUrl} controls autoPlay loop className="w-full border-2 border-black rounded-xl bg-black" />
          ) : gen.status === "failed" ? (
            <div className="aspect-video border-2 border-red-500 rounded-xl bg-red-50 flex flex-col items-center justify-center p-6">
              <div className="text-4xl mb-2">⚠️</div>
              <div className="font-semibold text-red-900">Generación fallida</div>
              <div className="text-sm text-red-700 mt-2 text-center max-w-md">{gen.failReason || "Error desconocido"}</div>
            </div>
          ) : (
            <div className="aspect-video border-2 border-black rounded-xl bg-gray-100 flex items-center justify-center animate-pulse">
              <div className="text-gray-500 text-sm">Estado: {gen.status}…</div>
            </div>
          )}

          {stillUrl && gen.status !== "completed" && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Preview del still generado:</div>
              <img src={stillUrl} alt="Still" className="w-full border-2 border-black rounded-xl" />
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="border-2 border-black rounded-xl bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Prompt original</div>
            <div className="text-sm">{gen.prompt}</div>
          </div>

          {gen.enhancedPrompt && (
            <div className="border-2 border-black rounded-xl bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Dirección cinematográfica</div>
              <div className="text-sm text-gray-700">{gen.enhancedPrompt}</div>
            </div>
          )}

          <div className="border-2 border-black rounded-xl bg-white p-4 space-y-2 text-sm">
            {gen.character && (
              <div className="flex justify-between">
                <span className="text-gray-500">Personaje</span>
                <Link to="/dash/characters" className="font-semibold underline">@{gen.character.slug}</Link>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Modelo</span>
              <span className="font-mono text-xs">{gen.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Formato</span>
              <span className="font-mono text-xs">{gen.aspectRatio}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duración</span>
              <span>{gen.duration}s</span>
            </div>
            {gen.costMxn && (
              <div className="flex justify-between">
                <span className="text-gray-500">Costo aprox.</span>
                <span>${gen.costMxn.toFixed(2)} MXN</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Creado</span>
              <span>{new Date(gen.createdAt).toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            <BrutalButton onClick={() => navigate(regenerateUrl)} containerClassName="w-full">
              Hacer otro
            </BrutalButton>
            {videoUrl && (
              <a href={videoUrl} download className="block">
                <BrutalButton mode="ghost" containerClassName="w-full">
                  Descargar mp4
                </BrutalButton>
              </a>
            )}
            <BrutalButton mode="danger" onClick={onDelete} isLoading={deleting} containerClassName="w-full">
              Borrar registro
            </BrutalButton>
          </div>
        </aside>
      </div>
    </div>
  );
}
