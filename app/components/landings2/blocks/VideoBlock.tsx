import type { LandingBlock } from "~/lib/landing2/blockTypes";

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  // YouTube
  let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;
  // Vimeo
  match = url.match(/vimeo\.com\/(\d+)/);
  if (match) return `https://player.vimeo.com/video/${match[1]}`;
  return null;
}

export function VideoBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const embedUrl = getEmbedUrl(c.videoUrl || "");

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-4xl mx-auto px-6">
        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold text-center outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2 mb-4"
        >
          {c.title || "Video"}
        </h2>

        <input
          type="text"
          value={c.videoUrl || ""}
          onChange={(e) => onUpdate({ videoUrl: e.target.value })}
          placeholder="URL de YouTube o Vimeo (ej: https://youtube.com/watch?v=...)"
          className="w-full text-sm bg-white/80 backdrop-blur border-2 border-black/10 rounded-lg px-3 py-2 mb-6"
        />

        <div className="relative rounded-xl overflow-hidden border-2 border-black/10 bg-black/5 aspect-video">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              title="Video preview"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm opacity-40 font-bold">
              Pega una URL de YouTube o Vimeo arriba
            </div>
          )}
        </div>

        <p
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ description: e.currentTarget.textContent || "" })}
          className="mt-6 text-center text-base opacity-70 max-w-2xl mx-auto outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.description || "Descripción del video"}
        </p>
      </div>
    </div>
  );
}
