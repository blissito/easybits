import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function LogoCloudBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const logos = c.logos || [];
  const isRow = c.variant === "row";
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...logos];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ logos: updated });
  };
  const addItem = () =>
    onUpdate({ logos: [...logos, { imageUrl: "", alt: "Logo", url: "" }] });
  const removeItem = (index: number) =>
    onUpdate({ logos: logos.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <BlockFloatingToolbar>
        <VariantSelector
          options={BLOCK_VARIANTS.logoCloud!}
          value={c.variant || "grid"}
          onChange={(v) => onUpdate({ variant: v })}
        />
      </BlockFloatingToolbar>
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-10 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Empresas que confian en nosotros"}
          </h2>
          <div
            className={
              isRow
                ? "flex flex-wrap items-center justify-center gap-10"
                : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 items-center"
            }
          >
            {logos.map((logo: any, i: number) => (
              <div
                key={i}
                className={`relative group flex flex-col items-center gap-2 ${
                  isRow
                    ? "p-4"
                    : "bg-black/5 rounded-2xl p-6"
                }`}
              >
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  x
                </button>
                {logo.imageUrl ? (
                  <img
                    src={logo.imageUrl}
                    alt={logo.alt || ""}
                    className={
                      isRow
                        ? "h-10 object-contain opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all duration-300"
                        : "h-16 object-contain"
                    }
                  />
                ) : (
                  <div className={`${isRow ? "h-10 w-20" : "h-16 w-28"} bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs`}>Logo</div>
                )}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 w-full">
                  <input
                    type="text"
                    value={logo.imageUrl || ""}
                    onChange={(e) => updateItem(i, "imageUrl", e.target.value)}
                    placeholder="URL imagen"
                    className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                  />
                  <input
                    type="text"
                    value={logo.alt || ""}
                    onChange={(e) => updateItem(i, "alt", e.target.value)}
                    placeholder="Alt text"
                    className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                  />
                  <input
                    type="text"
                    value={logo.url || ""}
                    onChange={(e) => updateItem(i, "url", e.target.value)}
                    placeholder="URL enlace"
                    className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                  />
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
              + Logo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
