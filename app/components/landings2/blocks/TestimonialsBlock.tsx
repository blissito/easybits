import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function TestimonialsBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const variant = c.variant || "cards";
  const items: { quote?: string; author?: string; role?: string; avatarUrl?: string }[] =
    c.items || [];

  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ items: updated });
  };
  const addItem = () =>
    onUpdate({
      items: [...items, { quote: "Gran producto", author: "Nombre", role: "Cargo", avatarUrl: "" }],
    });
  const removeItem = (index: number) =>
    onUpdate({ items: items.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <BlockFloatingToolbar>
          <VariantSelector
            options={BLOCK_VARIANTS.testimonials || []}
            value={c.variant || "cards"}
            onChange={(v) => onUpdate({ variant: v })}
          />
        </BlockFloatingToolbar>

        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold text-center mb-12 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.title || "Testimonios"}
        </h2>

        {variant === "quote-large" ? (
          <div className="max-w-3xl mx-auto text-center">
            {items.slice(0, 1).map((item, i) => (
              <div key={i} className="relative group">
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
                >
                  &times;
                </button>
                <span
                  className="block text-7xl leading-none font-serif opacity-20"
                  style={{ color: "var(--landing-accent)" }}
                >
                  &ldquo;
                </span>
                <p
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateItem(i, "quote", e.currentTarget.textContent || "")}
                  className="text-2xl lg:text-3xl italic font-medium leading-relaxed outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2 -mt-6 mb-6"
                >
                  {item.quote || "Gran producto"}
                </p>
                <span
                  className="block text-7xl leading-none font-serif opacity-20 rotate-180"
                  style={{ color: "var(--landing-accent)" }}
                >
                  &ldquo;
                </span>
                <div className="flex items-center justify-center gap-3 mt-6">
                  <input
                    type="text"
                    value={item.avatarUrl || ""}
                    onChange={(e) => updateItem(i, "avatarUrl", e.target.value)}
                    placeholder="Avatar URL"
                    className="text-xs bg-white/80 border border-black/10 rounded-lg px-2 py-1 w-24"
                  />
                  {item.avatarUrl && (
                    <img
                      src={item.avatarUrl}
                      alt={item.author || ""}
                      className="w-14 h-14 rounded-full object-cover border-2"
                      style={{ borderColor: "var(--landing-accent)" }}
                    />
                  )}
                  <div>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "author", e.currentTarget.textContent || "")}
                      className="block font-bold text-base outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {item.author || "Nombre"}
                    </span>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "role", e.currentTarget.textContent || "")}
                      className="block text-sm opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {item.role || "Cargo"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item, i) => (
              <div
                key={i}
                className="relative group rounded-xl p-6 border-2"
                style={{ borderColor: "color-mix(in srgb, var(--landing-text) 15%, transparent)" }}
              >
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
                >
                  &times;
                </button>
                {item.avatarUrl && (
                  <img
                    src={item.avatarUrl}
                    alt={item.author || ""}
                    className="w-12 h-12 rounded-full object-cover mb-4 border-2"
                    style={{ borderColor: "var(--landing-accent)" }}
                  />
                )}
                <p
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateItem(i, "quote", e.currentTarget.textContent || "")}
                  className="text-base italic opacity-80 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1 mb-4"
                >
                  {item.quote || "Gran producto"}
                </p>
                <div className="flex items-center gap-3 mt-auto">
                  <input
                    type="text"
                    value={item.avatarUrl || ""}
                    onChange={(e) => updateItem(i, "avatarUrl", e.target.value)}
                    placeholder="Avatar URL"
                    className="text-xs bg-white/80 border border-black/10 rounded-lg px-2 py-1 w-24"
                  />
                  <div className="flex-1">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "author", e.currentTarget.textContent || "")}
                      className="block font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {item.author || "Nombre"}
                    </span>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "role", e.currentTarget.textContent || "")}
                      className="block text-xs opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {item.role || "Cargo"}
                    </span>
                  </div>
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
            + Agregar testimonio
          </button>
        </div>
      </div>
    </div>
  );
}
