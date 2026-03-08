import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function TimelineBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const events = c.events || [];
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...events];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ events: updated });
  };
  const addItem = () =>
    onUpdate({
      events: [...events, { date: "2026", title: "Evento", desc: "" }],
    });
  const removeItem = (index: number) =>
    onUpdate({ events: events.filter((_: any, i: number) => i !== index) });

  const variant = c.variant || "vertical";

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <BlockFloatingToolbar>
        <VariantSelector
          options={BLOCK_VARIANTS.timeline!}
          value={variant}
          onChange={(v) => onUpdate({ variant: v })}
        />
      </BlockFloatingToolbar>
      <section className="py-20 px-6">
        <div className={`mx-auto ${variant === "steps" ? "max-w-5xl" : "max-w-4xl"}`}>
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-10 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Timeline"}
          </h2>

          {variant === "steps" ? (
            <div className="relative">
              {/* Connector line */}
              {events.length > 1 && (
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-300" style={{ left: `${100 / (events.length * 2)}%`, right: `${100 / (events.length * 2)}%` }} />
              )}
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${events.length}, 1fr)` }}>
                {events.map((ev: any, i: number) => (
                  <div key={i} className="relative group flex flex-col items-center text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="absolute -top-2 right-0 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      x
                    </button>
                    {/* Numbered circle */}
                    <div className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold text-sm border-4 border-white shadow-md z-10 mb-4">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={ev.date || ""}
                      onChange={(e) => updateItem(i, "date", e.target.value)}
                      placeholder="Fecha"
                      className="text-xs font-bold bg-white/80 border rounded px-2 py-1 mb-1 w-full text-center"
                    />
                    <h3
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "title", e.currentTarget.textContent || "")}
                      className="font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {ev.title || "Titulo"}
                    </h3>
                    <p
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(i, "desc", e.currentTarget.textContent || "")}
                      className="text-xs opacity-70 mt-1 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    >
                      {ev.desc || "Descripcion"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={
                variant === "horizontal"
                  ? "flex gap-6 overflow-x-auto pb-4"
                  : "relative flex flex-col gap-0"
              }
            >
              {variant === "vertical" && events.length > 0 && (
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300" />
              )}
              {events.map((ev: any, i: number) => (
                <div
                  key={i}
                  className={`relative group ${
                    variant === "horizontal"
                      ? "flex-shrink-0 w-56 border border-dashed border-gray-300 rounded-xl p-4"
                      : "pl-10 pb-8"
                  }`}
                >
                  {variant === "vertical" && (
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-white shadow" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    x
                  </button>
                  <input
                    type="text"
                    value={ev.date || ""}
                    onChange={(e) => updateItem(i, "date", e.target.value)}
                    placeholder="Fecha"
                    className="text-xs font-bold bg-white/80 border rounded px-2 py-1 mb-1 w-full"
                  />
                  <h3
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updateItem(i, "title", e.currentTarget.textContent || "")}
                    className="font-bold text-base outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                  >
                    {ev.title || "Titulo"}
                  </h3>
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updateItem(i, "desc", e.currentTarget.textContent || "")}
                    className="text-sm opacity-70 mt-1 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                  >
                    {ev.desc || "Descripcion"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Evento
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
