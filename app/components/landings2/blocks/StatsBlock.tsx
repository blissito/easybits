import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
    >
      &times;
    </button>
  );
}

function StatValue({ value, index, updateItem, className }: { value?: string; index: number; updateItem: (i: number, f: string, v: string) => void; className: string }) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => updateItem(index, "value", e.currentTarget.textContent || "")}
      className={className}
      style={{ color: "var(--landing-accent)" }}
    >
      {value || "99%"}
    </span>
  );
}

function StatLabel({ label, index, updateItem, className }: { label?: string; index: number; updateItem: (i: number, f: string, v: string) => void; className: string }) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => updateItem(index, "label", e.currentTarget.textContent || "")}
      className={className}
    >
      {label || "Métrica"}
    </span>
  );
}

function StatDesc({ desc, index, updateItem }: { desc?: string; index: number; updateItem: (i: number, f: string, v: string) => void }) {
  return (
    <p
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => updateItem(index, "desc", e.currentTarget.textContent || "")}
      className="mt-1 text-sm opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
    >
      {desc || "Descripción"}
    </p>
  );
}

export function StatsBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const variant = c.variant || "big-numbers";
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

        {variant === "big-numbers" && (
          <div className="grid md:grid-cols-3 gap-8">
            {items.map((item, i) => (
              <div key={i} className="relative group text-center p-6">
                <RemoveButton onClick={() => removeItem(i)} />
                <StatValue value={item.value} index={i} updateItem={updateItem} className="block text-5xl lg:text-6xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                <StatLabel label={item.label} index={i} updateItem={updateItem} className="block mt-3 font-bold text-lg uppercase tracking-wider outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                <StatDesc desc={item.desc} index={i} updateItem={updateItem} />
              </div>
            ))}
          </div>
        )}

        {variant === "cards" && (
          <div className="grid md:grid-cols-3 gap-8">
            {items.map((item, i) => (
              <div
                key={i}
                className="relative group text-center rounded-xl p-8"
                style={{
                  border: "2px solid var(--landing-accent)",
                  boxShadow: "4px 4px 0 var(--landing-accent)",
                }}
              >
                <RemoveButton onClick={() => removeItem(i)} />
                <StatValue value={item.value} index={i} updateItem={updateItem} className="block text-4xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                <StatLabel label={item.label} index={i} updateItem={updateItem} className="block mt-2 font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                <StatDesc desc={item.desc} index={i} updateItem={updateItem} />
              </div>
            ))}
          </div>
        )}

        {variant === "inline" && (
          <div className="flex flex-wrap items-center justify-center">
            {items.map((item, i) => (
              <div key={i} className="relative group flex items-center">
                {i > 0 && (
                  <div
                    className="hidden md:block w-px h-16 mx-8"
                    style={{ background: "var(--landing-accent)" }}
                  />
                )}
                <div className="text-center px-6 py-4">
                  <RemoveButton onClick={() => removeItem(i)} />
                  <StatValue value={item.value} index={i} updateItem={updateItem} className="block text-4xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                  <StatLabel label={item.label} index={i} updateItem={updateItem} className="block mt-1 font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1" />
                  <StatDesc desc={item.desc} index={i} updateItem={updateItem} />
                </div>
              </div>
            ))}
          </div>
        )}

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
