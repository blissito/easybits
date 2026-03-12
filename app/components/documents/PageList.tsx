import React, { useRef, useState, useMemo, useEffect } from "react";
import type { Section3 } from "~/lib/landing3/types";
import { LANDING_THEMES, type LandingTheme, type CustomColors } from "@easybits.cloud/html-tailwind-generator";

interface PageListProps {
  sections: Section3[];
  selectedSectionIds: string[];
  onSelect: (id: string, multi: boolean) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAdd: () => void;
  theme?: string;
  onThemeChange?: (themeId: string) => void;
  customColors?: CustomColors;
  onCustomColorChange?: (colors: Partial<CustomColors>) => void;
  themeCssData?: { css: string; tailwindConfig: string };
  onRestoreVersion?: (sectionId: string, html: string) => void;
  /** Navigate version without pushing to history — just swap displayed html */
  onNavigateVersion?: (sectionId: string, html: string) => void;
  onGenerateVariant?: (sectionId: string, instruction?: string, referenceImage?: string) => void;
  onStopVariant?: () => void;
  loadingVariantId?: string | null;
  refiningIds?: Set<string>;
  onContextMenu?: (sectionIds: string[], position: { x: number; y: number }) => void;
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
  selectedSectionIds,
  onSelect,
  onOpenCode,
  onReorder,
  onDelete,
  onRename,
  onAdd,
  theme,
  onThemeChange,
  customColors,
  onCustomColorChange,
  themeCssData,
  onRestoreVersion,
  onNavigateVersion,
  onGenerateVariant,
  onStopVariant,
  loadingVariantId,
  refiningIds,
  onContextMenu,
}: PageListProps) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const dragRef = useRef<number | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showThemes, setShowThemes] = useState(false);
  // Version navigation: index into versions array (undefined = current/active html)
  const [versionView, setVersionView] = useState<Record<string, number>>({});
  // Store the "current active" html when user first navigates back, so ▶ can restore it
  const activeHtmlRef = useRef<Record<string, string>>({});

  const themeRef = useRef<HTMLDivElement>(null);

  // Close popups on ESC + click outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showThemes) setShowThemes(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (showThemes && themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setShowThemes(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [showThemes]);

  // Auto-scroll sidebar to selected thumbnail
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (selectedSectionIds.length === 1) {
      const doScroll = () => itemRefs.current[selectedSectionIds[0]]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (!initialScrollDone.current) {
        initialScrollDone.current = true;
        setTimeout(doScroll, 100);
      } else {
        doScroll();
      }
    }
  }, [selectedSectionIds]);

  // Auto-scroll to last thumbnail when new sections are added
  const prevSectionCount = useRef(sections.length);
  useEffect(() => {
    if (sections.length > prevSectionCount.current) {
      const lastId = sorted[sorted.length - 1]?.id;
      if (lastId) {
        setTimeout(() => itemRefs.current[lastId]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
      }
    }
    prevSectionCount.current = sections.length;
  }, [sections.length, sorted]);

  return (
    <div className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
          P&aacute;ginas
        </h3>
        {onThemeChange && (
          <div className="relative" ref={themeRef}>
            <button
              onClick={() => setShowThemes((p) => !p)}
              className="text-[10px] font-bold text-brand-600 hover:underline flex items-center gap-1"
            >
              {(() => {
                if (theme === "custom") {
                  return (
                    <>
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: customColors?.primary || "#6366f1" }} />
                      Custom
                    </>
                  );
                }
                const t = LANDING_THEMES.find((t) => t.id === theme);
                return t ? (
                  <>
                    <span className="flex gap-0.5">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: t.colors.primary }} />
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: t.colors.accent }} />
                    </span>
                    {t.label}
                  </>
                ) : "Tema";
              })()}
            </button>
            {showThemes && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_#000] z-50 py-1">
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
                {/* Custom theme option */}
                {onCustomColorChange && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <div className={`px-3 py-1.5 ${theme === "custom" ? "bg-brand-50" : ""}`}>
                      <button
                        onClick={() => {
                          onThemeChange("custom");
                        }}
                        className={`w-full text-left text-xs font-bold flex items-center gap-2 ${theme === "custom" ? "text-brand-700" : ""}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-gray-300"
                          style={customColors?.primary ? { backgroundColor: customColors.primary, borderColor: customColors.primary } : undefined}
                        />
                        Custom
                      </button>
                      {theme === "custom" && (
                        <div className="mt-2 space-y-1.5">
                          {([
                            { key: "primary" as const, label: "Principal", fallback: "#6366f1" },
                            { key: "secondary" as const, label: "Secundario", fallback: "#8b5cf6" },
                            { key: "accent" as const, label: "Acento", fallback: "#f59e0b" },
                            { key: "surface" as const, label: "Superficie", fallback: "#f8fafc" },
                          ]).map((c) => (
                            <label key={c.key} className="flex items-center gap-1.5 text-[10px] text-gray-600">
                              <input
                                type="color"
                                className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                                value={customColors?.[c.key] || c.fallback}
                                onChange={(e) => onCustomColorChange({ [c.key]: e.target.value })}
                              />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {sorted.map((section, idx) => {
          const isSelected = selectedSectionIds.includes(section.id);

          return (
            <div
              key={section.id}
              ref={(el) => { itemRefs.current[section.id] = el; }}
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
              onClick={(e) => onSelect(section.id, e.metaKey || e.ctrlKey)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (onContextMenu) {
                  const ids = isSelected ? selectedSectionIds : [section.id];
                  if (!isSelected) onSelect(section.id, false);
                  onContextMenu(ids, { x: e.clientX, y: e.clientY });
                }
              }}
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
              <div className="relative">
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
                  {/* Transparent overlay to capture clicks on Safari (iframe swallows contextmenu despite pointer-events-none) */}
                  <div className="absolute inset-0 z-[2]" />
                  {/* Refine loading overlay */}
                  {refiningIds?.has(section.id) && (
                    <div className="absolute inset-0 bg-white/60 z-10 flex flex-col items-center justify-center rounded-t-lg">
                      <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                      <span className="text-[9px] font-bold text-brand-600 mt-1">Refinando</span>
                    </div>
                  )}
                  {/* Variant loading overlay */}
                  {loadingVariantId === section.id && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center rounded-t-lg">
                      <span className="block w-4 h-4 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                      <span className="text-[9px] font-bold text-brand-600 mt-1">Regenerando</span>
                      {onStopVariant && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onStopVariant(); }}
                          className="mt-1.5 text-[9px] font-bold text-red-500 hover:text-red-700 px-2 py-0.5 border border-red-300 rounded-lg bg-white hover:bg-red-50 transition-colors"
                        >
                          Detener
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Version arrows — only when versions exist */}
              {(() => {
                const sv = section as Section3WithVersions;
                const versions = sv.versions || [];
                if (versions.length === 0) return null;
                // total = versions (old) + 1 (current active)
                const total = versions.length + 1;
                const viewIdx = versionView[section.id];
                // undefined = current (last), else index into versions array
                const currentPos = viewIdx !== undefined ? viewIdx + 1 : total;
                const isFirst = currentPos === 1;
                const isLast = currentPos === total;
                return (
                  <div className="flex items-center justify-center gap-1.5 px-1.5 py-0.5 bg-gray-100 border-x border-gray-200">
                    <button
                      disabled={isFirst}
                      onClick={(e) => {
                        e.stopPropagation();
                        // First time navigating back: snapshot current active html
                        if (viewIdx === undefined) {
                          activeHtmlRef.current[section.id] = section.html;
                        }
                        const newIdx = viewIdx !== undefined ? viewIdx - 1 : versions.length - 1;
                        setVersionView((p) => ({ ...p, [section.id]: newIdx }));
                        onNavigateVersion?.(section.id, versions[newIdx].html);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-brand-600 disabled:opacity-30 disabled:cursor-default text-[10px]"
                    >
                      &#9664;
                    </button>
                    <span className="text-[9px] font-bold text-gray-500 tabular-nums">
                      {currentPos}/{total}
                    </span>
                    <button
                      disabled={isLast}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (viewIdx !== undefined) {
                          const newIdx = viewIdx + 1;
                          if (newIdx >= versions.length) {
                            // Back to current active
                            setVersionView((p) => {
                              const next = { ...p };
                              delete next[section.id];
                              return next;
                            });
                            const activeHtml = activeHtmlRef.current[section.id];
                            if (activeHtml) onNavigateVersion?.(section.id, activeHtml);
                          } else {
                            setVersionView((p) => ({ ...p, [section.id]: newIdx }));
                            onNavigateVersion?.(section.id, versions[newIdx].html);
                          }
                        }
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-brand-600 disabled:opacity-30 disabled:cursor-default text-[10px]"
                    >
                      &#9654;
                    </button>
                  </div>
                );
              })()}
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
