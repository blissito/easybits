import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function StatsBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const items: { value?: string; label?: string; desc?: string }[] = c.items || [];

  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ items: updated });
  };
  const addItem = () =>
    onUpdate({ items: [...items, { value: "99%", label: "Métrica", desc: "Descripción" }] });
  const removeItem = (index: number) =>
    onUpdate({ items: items.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <BlockFloatingToolbar>
          <VariantSelector
            options={BLOCK_VARIANTS.stats || []}
            value={c.variant || "big-numbers"}
            onChange={(v) => onUpdate({ variant: v })}
          />
        </BlockFloatingToolbar>

        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold text-center mb-12 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.title || "Estadísticas"}
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {items.map((item, i) => (
            <div key={i} className="relative group text-center border-2 border-black/10 rounded-xl p-6">
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
              >
                &times;
              </button>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "value", e.currentTarget.textContent || "")}
                className="block text-4xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
                style={{ color: "var(--landing-accent)" }}
              >
                {item.value || "99%"}
              </span>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "label", e.currentTarget.textContent || "")}
                className="block mt-2 font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
              >
                {item.label || "Métrica"}
              </span>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "desc", e.currentTarget.textContent || "")}
                className="mt-1 text-sm opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
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
            + Agregar estadística
          </button>
        </div>
      </div>
    </div>
  );
}
