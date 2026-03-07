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
          {items.map((item, i) => {
            const variant = c.variant || "cards";

            const removeBtn = (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
              >
                &times;
              </button>
            );

            const iconInput = (extraClass = "") => (
              <input
                type="text"
                value={item.icon || ""}
                onChange={(e) => updateItem(i, "icon", e.target.value)}
                className={`bg-transparent border-none outline-none ${extraClass}`}
                placeholder="⚡"
              />
            );

            const titleEl = (extraClass = "") => (
              <h3
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "title", e.currentTarget.textContent || "")}
                className={`font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1 ${extraClass}`}
              >
                {item.title || "Feature"}
              </h3>
            );

            const descEl = (extraClass = "") => (
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "desc", e.currentTarget.textContent || "")}
                className={`text-sm opacity-70 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1 ${extraClass}`}
              >
                {item.desc || "Descripción"}
              </p>
            );

            if (variant === "cards-icon") {
              return (
                <div key={i} className="relative group rounded-2xl p-8 border-2 transition-shadow hover:shadow-lg" style={{ borderColor: "color-mix(in srgb, var(--landing-text) 10%, transparent)", background: "var(--landing-bg)" }}>
                  {removeBtn}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-2xl" style={{ background: "var(--landing-accent)", color: "var(--landing-accent-text)" }}>
                    {iconInput("text-2xl w-14 text-center")}
                  </div>
                  {titleEl("text-xl")}
                  {descEl("mt-3")}
                </div>
              );
            }

            if (variant === "bordered") {
              return (
                <div key={i} className="relative group pl-6 py-5 pr-4 border-l-[5px] rounded-r-xl transition-colors" style={{ borderColor: "var(--landing-accent)", background: "color-mix(in srgb, var(--landing-accent) 5%, var(--landing-bg))" }}>
                  {removeBtn}
                  <div className="text-3xl mb-2">
                    {iconInput("text-3xl w-12")}
                  </div>
                  {titleEl("text-xl")}
                  {descEl("mt-2")}
                </div>
              );
            }

            if (variant === "minimal") {
              return (
                <div key={i} className="relative group flex items-start gap-5 py-5 px-4 rounded-xl transition-colors hover:bg-black/[0.03]">
                  {removeBtn}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--landing-accent) 15%, var(--landing-bg))", color: "var(--landing-accent)" }}>
                    {iconInput("text-2xl w-12 text-center")}
                  </div>
                  <div className="pt-0.5">
                    {titleEl("text-lg")}
                    {descEl("mt-1")}
                  </div>
                </div>
              );
            }

            /* variant === "cards" (default) */
            return (
              <div key={i} className="relative group rounded-2xl p-8 shadow-sm transition-shadow hover:shadow-md" style={{ background: "color-mix(in srgb, var(--landing-bg) 92%, var(--landing-text) 8%)" }}>
                {removeBtn}
                <div className="text-3xl mb-4">
                  {iconInput("text-3xl w-12")}
                </div>
                {titleEl("text-xl")}
                {descEl("mt-3")}
              </div>
            );
          })}
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
