import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function FeaturesBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const items: { icon?: string; title?: string; desc?: string }[] = c.items || [];
  const columns = c.columns || 3;

  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ items: updated });
  };
  const addItem = () =>
    onUpdate({ items: [...items, { icon: "⚡", title: "Feature", desc: "Descripción" }] });
  const removeItem = (index: number) =>
    onUpdate({ items: items.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <BlockFloatingToolbar>
          <VariantSelector
            options={BLOCK_VARIANTS.features || []}
            value={c.variant || "cards"}
            onChange={(v) => onUpdate({ variant: v })}
          />
          <div className="flex items-center gap-1 text-xs font-bold">
            <span className="opacity-60">Cols:</span>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onUpdate({ columns: n })}
                className={`px-2 py-1 rounded-lg border-2 border-black ${columns === n ? "bg-black text-white" : "bg-white"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </BlockFloatingToolbar>

        <div className="text-center mb-12">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl lg:text-4xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Características"}
          </h2>
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ subtitle: e.currentTarget.textContent || "" })}
            className="mt-4 text-lg opacity-70 max-w-2xl mx-auto outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.subtitle || "Subtítulo de la sección"}
          </p>
        </div>

        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {items.map((item, i) => (
            <div key={i} className="relative group border-2 border-black/10 rounded-xl p-6">
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
              >
                &times;
              </button>
              <input
                type="text"
                value={item.icon || ""}
                onChange={(e) => updateItem(i, "icon", e.target.value)}
                className="text-2xl bg-transparent border-none outline-none w-12 mb-2"
                placeholder="⚡"
              />
              <h3
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "title", e.currentTarget.textContent || "")}
                className="font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
              >
                {item.title || "Feature"}
              </h3>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "desc", e.currentTarget.textContent || "")}
                className="mt-2 text-sm opacity-70 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
              >
                {item.desc || "Descripción"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={addItem}
            className="text-xs font-bold px-4 py-2 border-2 border-dashed border-black/20 rounded-xl hover:border-black/40"
          >
            + Agregar feature
          </button>
        </div>
      </div>
    </div>
  );
}
