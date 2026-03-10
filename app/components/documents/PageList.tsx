import React, { useRef, useState, useMemo } from "react";
import type { Section3 } from "~/lib/landing3/types";
import { LANDING_THEMES, type LandingTheme } from "@easybits.cloud/html-tailwind-generator";

interface PageListProps {
  sections: Section3[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAdd: () => void;
  theme?: string;
  onThemeChange?: (themeId: string) => void;
  themeCssData?: { css: string; tailwindConfig: string };
  onRestoreVersion?: (sectionId: string, html: string) => void;
}

/** Section3 with optional version history */
export interface Section3WithVersions extends Section3 {
  versions?: { html: string; timestamp: number }[];
}

/** Build a tiny HTML preview of a section for the thumbnail */
function buildThumbnailHtml(section: Section3, themeCssData?: { css: string; tailwindConfig: string }): string {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"><\/script>
${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; width: 8.5in; overflow: hidden; }
${themeCssData?.css || ""}
</style>
</head><body>${section.html}</body></html>`;
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
  theme,
  onThemeChange,
  themeCssData,
  onRestoreVersion,
}: PageListProps) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const dragRef = useRef<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showThemes, setShowThemes] = useState(false);
  const [versionDropdown, setVersionDropdown] = useState<string | null>(null);

  return (
    <div className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
          P&aacute;ginas
        </h3>
        {onThemeChange && (
          <div className="relative">
            <button
              onClick={() => setShowThemes((p) => !p)}
              className="text-[10px] font-bold text-brand-600 hover:underline"
            >
              Tema
            </button>
            {showThemes && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1 max-h-48 overflow-y-auto">
                {LANDING_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setShowThemes(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center gap-2 hover:bg-gray-50 ${theme === t.id ? "bg-brand-50 text-brand-700" : ""}`}
                  >
                    <span className="flex gap-0.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colors.primary }} />
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colors.accent }} />
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colors.secondary }} />
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colors.surface, border: '1px solid #e5e7eb' }} />
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
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
              className={`group rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? "ring-2 ring-brand-500 ring-offset-1"
                  : "hover:ring-1 hover:ring-gray-300"
              }`}
            >
              {/* Thumbnail — scaled-down iframe clipped to container */}
              <div className="relative" style={{ marginTop: (section as Section3WithVersions).versions?.length ? 4 : 0 }}>
                {/* Stacked card shadows for versions */}
                {(section as Section3WithVersions).versions?.length ? (
                  <>
                    <div className="absolute inset-0 bg-gray-100 border border-gray-200 rounded-t-lg" style={{ transform: "translate(3px, -3px)", zIndex: 0 }} />
                    {((section as Section3WithVersions).versions?.length ?? 0) > 1 && (
                      <div className="absolute inset-0 bg-gray-50 border border-gray-200 rounded-t-lg" style={{ transform: "translate(6px, -6px)", zIndex: 0 }} />
                    )}
                  </>
                ) : null}
                <div
                  className="w-full bg-white rounded-t-lg border border-gray-200 relative overflow-hidden"
                  style={{ aspectRatio: "8.5 / 11", zIndex: 1 }}
                >
                  <iframe
                    srcDoc={buildThumbnailHtml(section, themeCssData)}
                    className="absolute top-0 left-0 border-none pointer-events-none"
                    style={{
                      width: "8.5in",
                      height: "11in",
                      transform: "scale(var(--thumb-scale))",
                      transformOrigin: "top left",
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const parent = el.parentElement;
                      if (!parent) return;
                      const ro = new ResizeObserver(([entry]) => {
                        const scale = entry.contentRect.width / (8.5 * 96);
                        el.style.setProperty("--thumb-scale", String(scale));
                      });
                      ro.observe(parent);
                    }}
                    title={section.label || `Página ${idx + 1}`}
                    tabIndex={-1}
                  />
                  {/* Version badge */}
                  {(section as Section3WithVersions).versions?.length ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setVersionDropdown(versionDropdown === section.id ? null : section.id);
                      }}
                      className="absolute top-1 right-1 bg-brand-500 text-white text-[8px] font-bold px-1 py-0.5 rounded z-10"
                      title="Ver versiones anteriores"
                    >
                      {(section as Section3WithVersions).versions!.length}v
                    </button>
                  ) : null}
                </div>
                {/* Version dropdown */}
                {versionDropdown === section.id && (section as Section3WithVersions).versions?.length ? (
                  <div className="absolute right-0 top-6 w-40 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1 max-h-40 overflow-y-auto">
                    <div className="px-2 py-1 text-[9px] font-black text-gray-400 uppercase">Versiones</div>
                    {(section as Section3WithVersions).versions!.slice().reverse().map((v, vi) => (
                      <button
                        key={v.timestamp}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestoreVersion?.(section.id, v.html);
                          setVersionDropdown(null);
                        }}
                        className="w-full text-left px-2 py-1 text-[10px] hover:bg-brand-50 flex items-center justify-between"
                      >
                        <span className="text-gray-600">
                          {new Date(v.timestamp).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-brand-600 font-bold text-[9px]">Restaurar</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* Label row */}
              <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-50 rounded-b-lg border border-t-0 border-gray-200">
                <span className="text-[10px] text-gray-400 font-mono w-3 shrink-0 text-right">
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
                    className="flex-1 min-w-0 text-[10px] px-1 py-0 border border-gray-300 rounded focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-[10px] font-medium truncate">
                    {section.label || `P\u00e1gina ${idx + 1}`}
                  </span>
                )}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCode(section.id);
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-[9px]"
                    title="Ver c&oacute;digo"
                  >
                    &lt;/&gt;
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(section.id);
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 text-[9px]"
                    title="Eliminar p&aacute;gina"
                  >
                    &times;
                  </button>
                </div>
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
          + Agregar p&aacute;ginas
        </button>
      </div>
    </div>
  );
}
