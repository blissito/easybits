import React, { useRef, useState } from "react";
import type { Section3 } from "~/lib/landing3/types";

interface PageListProps {
  sections: Section3[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAdd: () => void;
}

export function PageList({
  sections,
  selectedSectionId,
  onSelect,
  onOpenCode,
  onReorder,
  onDelete,
  onRename,
  onAdd,
}: PageListProps) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const dragRef = useRef<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  return (
    <div className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
          P&aacute;ginas
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {sorted.map((section, idx) => {
          const isSelected = section.id === selectedSectionId;

          return (
            <div
              key={section.id}
              draggable
              onDragStart={() => {
                dragRef.current = idx;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragRef.current !== null && dragRef.current !== idx) {
                  onReorder(dragRef.current, idx);
                }
                dragRef.current = null;
              }}
              onClick={() => onSelect(section.id)}
              onDoubleClick={() => {
                setEditingId(section.id);
                setEditLabel(section.label || `P\u00e1gina ${idx + 1}`);
              }}
              className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                isSelected
                  ? "bg-brand-50 border border-brand-300"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <span className="text-xs text-gray-400 font-mono w-4 shrink-0 text-right">
                {idx + 1}
              </span>
              {editingId === section.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => {
                    if (editLabel.trim()) onRename(section.id, editLabel.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editLabel.trim()) onRename(section.id, editLabel.trim());
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 min-w-0 text-xs px-1 py-0.5 border border-gray-300 rounded focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 min-w-0 text-xs font-medium truncate">
                  {section.label || `P\u00e1gina ${idx + 1}`}
                </span>
              )}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCode(section.id);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-[10px]"
                  title="Ver c&oacute;digo"
                >
                  &lt;/&gt;
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(section.id);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 text-xs"
                  title="Eliminar p&aacute;gina"
                >
                  &times;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 py-2 border-t border-gray-100">
        <button
          onClick={onAdd}
          className="w-full py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
        >
          + Agregar p&aacute;gina
        </button>
      </div>
    </div>
  );
}
