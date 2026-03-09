import React, { useRef, useState } from "react";
import type { Section3 } from "../types";
import { LANDING_THEMES, type CustomColors } from "../themes";

interface SectionListProps {
  sections: Section3[];
  selectedSectionId: string | null;
  theme: string;
  customColors?: CustomColors;
  onThemeChange: (themeId: string) => void;
  onCustomColorChange?: (colors: Partial<CustomColors>) => void;
  onSelect: (id: string) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAdd: () => void;
}

export function SectionList({
  sections,
  selectedSectionId,
  theme,
  customColors,
  onThemeChange,
  onCustomColorChange,
  onSelect,
  onOpenCode,
  onReorder,
  onDelete,
  onRename,
  onAdd,
}: SectionListProps) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  return (
    <div className="w-56 shrink-0 flex flex-col bg-white border-r-2 border-gray-200 overflow-y-auto">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
          Tema
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {LANDING_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              title={t.label}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                theme === t.id
                  ? "border-black scale-110 shadow-sm"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              style={{ backgroundColor: t.colors.primary }}
            />
          ))}
          {/* Custom color picker */}
          <button
            onClick={() => colorInputRef.current?.click()}
            title="Color personalizado"
            className={`w-6 h-6 rounded-full border-2 transition-all relative overflow-hidden ${
              theme === "custom"
                ? "border-black scale-110 shadow-sm"
                : "border-gray-300 hover:border-gray-400"
            }`}
            style={theme === "custom" && customColors?.primary ? { backgroundColor: customColors.primary } : undefined}
          >
            {theme !== "custom" && (
              <span className="absolute inset-0 rounded-full"
                style={{ background: "conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)" }}
              />
            )}
          </button>
          <input
            ref={colorInputRef}
            type="color"
            value={customColors?.primary || "#6366f1"}
            onChange={(e) => onCustomColorChange?.({ primary: e.target.value })}
            className="sr-only"
          />
        </div>
        {/* Multi-color pickers when custom theme is active */}
        {theme === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            {([
              { key: "primary" as const, label: "Pri", fallback: "#6366f1" },
              { key: "secondary" as const, label: "Sec", fallback: "#f59e0b" },
              { key: "accent" as const, label: "Acc", fallback: "#06b6d4" },
              { key: "surface" as const, label: "Sur", fallback: "#ffffff" },
            ]).map((c) => (
              <label key={c.key} className="flex flex-col items-center gap-0.5 cursor-pointer">
                <input
                  type="color"
                  value={customColors?.[c.key] || c.fallback}
                  onChange={(e) => onCustomColorChange?.({ [c.key]: e.target.value })}
                  className="w-5 h-5 rounded border border-gray-300 cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded"
                />
                <span className="text-[9px] font-bold text-gray-400 uppercase">{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
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
                ? "bg-blue-50 border-l-2 border-blue-500"
                : "hover:bg-gray-50 border-l-2 border-transparent"
            }`}
          >
            <span className="text-[10px] font-mono text-gray-400 w-4 text-right">
              {i + 1}
            </span>
            {editingId === section.id ? (
              <input
                type="text"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onBlur={() => {
                  if (editingLabel.trim()) onRename(section.id, editingLabel.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (editingLabel.trim()) onRename(section.id, editingLabel.trim());
                    setEditingId(null);
                  } else if (e.key === "Escape") {
                    setEditingId(null);
                  }
                }}
                className="text-sm font-bold flex-1 min-w-0 bg-transparent border-b border-blue-500 outline-none px-0 py-0"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="text-sm font-bold truncate flex-1"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(section.id);
                  setEditingLabel(section.label);
                }}
              >
                {section.label}
              </span>
            )}
            <div className="hidden group-hover:flex gap-0.5 shrink-0">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(section.id);
                }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 text-[10px]"
                title="Eliminar seccion"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200">
        <button
          onClick={onAdd}
          className="w-full text-center py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          + Agregar seccion
        </button>
      </div>
    </div>
  );
}
