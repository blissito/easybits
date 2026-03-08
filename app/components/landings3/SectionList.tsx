import type { Section3 } from "~/lib/landing3/types";

interface SectionListProps {
  sections: Section3[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
}

export function SectionList({
  sections,
  selectedSectionId,
  onSelect,
  onOpenCode,
  onReorder,
  onAdd,
}: SectionListProps) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="w-56 shrink-0 flex flex-col bg-white border-r-2 border-gray-200 overflow-y-auto">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">
          Secciones
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sorted.map((section, i) => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
              selectedSectionId === section.id
                ? "bg-brand-50 border-l-2 border-brand-500"
                : "hover:bg-gray-50 border-l-2 border-transparent"
            }`}
          >
            <span className="text-[10px] font-mono text-gray-400 w-4 text-right">
              {i + 1}
            </span>
            <span className="text-sm font-bold truncate flex-1">
              {section.label}
            </span>
            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCode(section.id);
                }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
                title="Editar HTML"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z"/></svg>
              </button>
              {i > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(i, i - 1);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-[10px]"
                >
                  ↑
                </button>
              )}
              {i < sorted.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(i, i + 1);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-[10px]"
                >
                  ↓
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200">
        <button
          onClick={onAdd}
          className="w-full text-center py-2 text-sm font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
        >
          + Agregar sección
        </button>
      </div>
    </div>
  );
}
