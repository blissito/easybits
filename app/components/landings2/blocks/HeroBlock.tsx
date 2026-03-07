import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function HeroBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  return (
    <div
      style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}
      className="relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-6 py-24 lg:py-32 flex flex-col lg:flex-row items-center gap-12">
        <div className="flex-1 text-center lg:text-left">
          <h1
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ headline: e.currentTarget.textContent || "" })}
            className="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.headline || "Tu título aquí"}
          </h1>
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ subtitle: e.currentTarget.textContent || "" })}
            className="mt-6 text-xl opacity-80 max-w-xl outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.subtitle || "Subtítulo descriptivo"}
          </p>
          <div className="mt-10 flex items-center gap-3 justify-center lg:justify-start">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onUpdate({ ctaText: e.currentTarget.textContent || "" })}
              style={{ background: "var(--landing-accent)", color: "var(--landing-accent-text)" }}
              className="inline-block px-8 py-4 rounded-lg font-bold text-lg cursor-text outline-none focus:ring-2 focus:ring-brand-500/30 shadow-lg"
            >
              {c.ctaText || "Comenzar"}
            </span>
          </div>
          <input
            type="text"
            value={c.ctaUrl || ""}
            onChange={(e) => onUpdate({ ctaUrl: e.target.value })}
            placeholder="URL del botón (ej: #pricing)"
            className="mt-3 text-xs bg-white/80 backdrop-blur border rounded-lg px-2 py-1 w-full max-w-xs"
          />
        </div>
        <div className="flex-1">
          <div className="relative group">
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt=""
                className="w-full max-w-lg mx-auto rounded-2xl shadow-2xl"
              />
            ) : (
              <div className="w-full max-w-lg mx-auto aspect-video bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
                Sin imagen
              </div>
            )}
            <input
              type="text"
              value={c.imageUrl || ""}
              onChange={(e) => onUpdate({ imageUrl: e.target.value })}
              placeholder="URL de imagen"
              className="absolute bottom-2 left-2 right-2 text-xs bg-white/90 backdrop-blur border rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
