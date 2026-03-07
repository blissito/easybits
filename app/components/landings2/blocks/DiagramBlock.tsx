import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { renderDiagramSvg } from "~/lib/landing2/diagrams";

const DIAGRAM_TYPES = [
  "funnel",
  "venn",
  "roadmap",
  "puzzle",
  "versus",
  "target",
  "pyramid",
  "cycle",
] as const;

export function DiagramBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const diagramType = c.diagramType || "funnel";
  const items = c.items || [];

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ items: updated });
  };
  const addItem = () =>
    onUpdate({ items: [...items, { label: "Item", value: 0, color: "" }] });
  const removeItem = (index: number) =>
    onUpdate({ items: items.filter((_: any, i: number) => i !== index) });

  const svgHtml = items.length > 0 ? renderDiagramSvg(diagramType, items) : "";

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-6 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Diagrama"}
          </h2>

          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
            <span className="text-xs font-bold">Tipo:</span>
            {DIAGRAM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdate({ diagramType: t })}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-2 border-black capitalize ${
                  diagramType === t
                    ? "bg-brand-500 text-white shadow-[2px_2px_0_#000]"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {svgHtml && (
            <div
              className="flex justify-center mb-8"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          )}

          <div className="space-y-3">
            {items.map((item: any, i: number) => (
              <div key={i} className="relative group flex items-center gap-2 border border-dashed border-gray-300 rounded-xl p-3">
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
                <input
                  type="text"
                  value={item.label || ""}
                  onChange={(e) => updateItem(i, "label", e.target.value)}
                  placeholder="Label"
                  className="flex-1 text-sm bg-white/80 border rounded px-2 py-1"
                />
                <input
                  type="number"
                  value={item.value ?? ""}
                  onChange={(e) => updateItem(i, "value", Number(e.target.value) || 0)}
                  placeholder="Valor"
                  className="w-20 text-sm bg-white/80 border rounded px-2 py-1"
                />
                <input
                  type="color"
                  value={item.color || "#9870ED"}
                  onChange={(e) => updateItem(i, "color", e.target.value)}
                  className="w-10 h-8 rounded border cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Item
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
