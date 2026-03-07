import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function ImageTextBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const imgLeft = c.imagePosition === "left";

  return (
    <div className="py-16 px-6">
      <div className={`max-w-6xl mx-auto flex flex-col ${imgLeft ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-10`}>
        <div className="flex-1">
          <div className="relative group">
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt=""
                className="w-full rounded-2xl shadow-lg"
              />
            ) : (
              <div className="w-full aspect-video bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
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
          <div className="flex gap-2 mt-2 justify-center">
            <button
              type="button"
              onClick={() => onUpdate({ imagePosition: "left" })}
              className={`text-xs px-2 py-1 rounded font-bold ${imgLeft ? "bg-black text-white" : "bg-gray-100"}`}
            >
              Img izquierda
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ imagePosition: "right" })}
              className={`text-xs px-2 py-1 rounded font-bold ${!imgLeft ? "bg-black text-white" : "bg-gray-100"}`}
            >
              Img derecha
            </button>
          </div>
        </div>
        <div className="flex-1">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold mb-4 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Título"}
          </h2>
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ body: e.currentTarget.textContent || "" })}
            className="text-lg opacity-70 leading-relaxed outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.body || "Descripción del contenido"}
          </p>
        </div>
      </div>
    </div>
  );
}
