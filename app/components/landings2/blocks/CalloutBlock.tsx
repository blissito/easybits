import type { LandingBlock } from "~/lib/landing2/blockTypes";

const CALLOUT_TYPES = [
  { value: "info", label: "Info", color: "#3B82F6", bg: "#EFF6FF" },
  { value: "warning", label: "Warning", color: "#F59E0B", bg: "#FFFBEB" },
  { value: "success", label: "Success", color: "#10B981", bg: "#ECFDF5" },
  { value: "question", label: "Question", color: "#8B5CF6", bg: "#F5F3FF" },
];

export function CalloutBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const type = c.type || "info";
  const config = CALLOUT_TYPES.find((t) => t.value === type) || CALLOUT_TYPES[0];

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          {CALLOUT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onUpdate({ type: t.value })}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-colors ${
                type === t.value
                  ? "border-black bg-black text-white"
                  : "border-black/20 bg-white hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="rounded-xl p-8 border-l-4"
          style={{ background: config.bg, borderLeftColor: config.color }}
        >
          <h3
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
            style={{ color: config.color }}
          >
            {c.title || "Título del callout"}
          </h3>
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ body: e.currentTarget.textContent || "" })}
            className="mt-3 text-base opacity-80 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.body || "Contenido del callout. Escribe aquí tu mensaje."}
          </p>
        </div>
      </div>
    </div>
  );
}
