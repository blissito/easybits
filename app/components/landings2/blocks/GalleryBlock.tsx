import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function GalleryBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const images = c.images || [];
  const columns = c.columns || 3;
  const variant = c.variant || "grid";
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...images];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ images: updated });
  };
  const addItem = () =>
    onUpdate({ images: [...images, { url: "", alt: "", caption: "" }] });
  const removeItem = (index: number) =>
    onUpdate({ images: images.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <BlockFloatingToolbar>
        <VariantSelector
          options={BLOCK_VARIANTS.gallery!}
          value={c.variant || "grid"}
          onChange={(v) => onUpdate({ variant: v })}
        />
      </BlockFloatingToolbar>
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-6 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Galeria"}
          </h2>

          <div className="flex items-center justify-center gap-2 mb-8">
            <span className="text-xs font-bold">Columnas:</span>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onUpdate({ columns: n })}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-2 border-black ${
                  columns === n
                    ? "bg-brand-500 text-white shadow-[2px_2px_0_#000]"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div
            className={
              variant === "masonry"
                ? "gap-4"
                : "grid gap-4"
            }
            style={
              variant === "masonry"
                ? { columns: `${columns}`, columnGap: "1rem" }
                : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
            }
          >
            {images.map((img: any, i: number) => (
              <div key={i} className={`relative group border border-dashed border-gray-300 rounded-xl overflow-hidden ${variant === "masonry" ? "mb-4 break-inside-avoid" : ""}`}>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  x
                </button>
                {img.url ? (
                  <img src={img.url} alt={img.alt || ""} className={`w-full object-cover ${variant === "masonry" ? "" : "aspect-square"}`} />
                ) : (
                  <div className={`w-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs ${variant === "masonry" ? "py-12" : "aspect-square"}`}>
                    Sin imagen
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <input
                    type="text"
                    value={img.url || ""}
                    onChange={(e) => updateItem(i, "url", e.target.value)}
                    placeholder="URL imagen"
                    className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                  />
                  <input
                    type="text"
                    value={img.alt || ""}
                    onChange={(e) => updateItem(i, "alt", e.target.value)}
                    placeholder="Alt text"
                    className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                  />
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updateItem(i, "caption", e.currentTarget.textContent || "")}
                    className="text-xs opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                  >
                    {img.caption || "Caption"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Imagen
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
