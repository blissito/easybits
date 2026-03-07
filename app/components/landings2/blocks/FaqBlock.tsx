import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function FaqBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const items: { question?: string; answer?: string }[] = c.items || [];

  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ items: updated });
  };
  const addItem = () =>
    onUpdate({ items: [...items, { question: "Pregunta frecuente", answer: "Respuesta aquí" }] });
  const removeItem = (index: number) =>
    onUpdate({ items: items.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-4xl mx-auto px-6">
        <BlockFloatingToolbar>
          <VariantSelector
            options={BLOCK_VARIANTS.faq || []}
            value={c.variant || "accordion"}
            onChange={(v) => onUpdate({ variant: v })}
          />
        </BlockFloatingToolbar>

        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold text-center mb-12 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.title || "Preguntas frecuentes"}
        </h2>

        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="relative group border-2 border-black/10 rounded-xl p-5">
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="absolute top-3 right-3 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
              >
                &times;
              </button>
              <h3
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "question", e.currentTarget.textContent || "")}
                className="font-bold text-base outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
              >
                {item.question || "Pregunta frecuente"}
              </h3>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateItem(i, "answer", e.currentTarget.textContent || "")}
                className="mt-2 text-sm opacity-70 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-1"
              >
                {item.answer || "Respuesta aquí"}
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
            + Agregar pregunta
          </button>
        </div>
      </div>
    </div>
  );
}
