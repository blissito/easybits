import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import type { Section3 } from "~/lib/landing3/types";
import { LANDING_THEMES, type LandingTheme, type CustomColors } from "@easybits.cloud/html-tailwind-generator";

interface BrandKit {
  id: string;
  name: string;
  colors: { primary: string; secondary: string; accent: string; surface: string };
  fonts?: { heading: string; body: string } | null;
  isDefault: boolean;
}

interface PageListProps {
  /** Document id — used to fetch server-rendered page thumbnails. When absent
   *  (e.g. book chapters, which aren't v4 landings), thumbnails are skipped. */
  documentId?: string;
  sections: Section3[];
  selectedSectionIds: string[];
  onSelect: (id: string, multi: boolean) => void;
  onOpenCode: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAdd: () => void;
  onInsertAt?: (afterIndex: number) => void;
  onDropImage?: (afterIndex: number, file: File) => void;
  theme?: string;
  onThemeChange?: (themeId: string) => void;
  customColors?: CustomColors;
  onCustomColorChange?: (colors: Partial<CustomColors>) => void;
  themeCssData?: { css: string; tailwindConfig: string };
  onRestoreVersion?: (sectionId: string, html: string) => void;
  /** Preview a version in the canvas (read-only, no state mutation) */
  onNavigateVersion?: (sectionId: string, html: string) => void;
  /** Exit version preview, return to current html */
  onExitPreview?: (sectionId: string) => void;
  onGenerateVariant?: (sectionId: string, instruction?: string, referenceImage?: string) => void;
  onStopVariant?: () => void;
  loadingVariantId?: string | null;
  refiningIds?: Set<string>;
  onContextMenu?: (sectionIds: string[], position: { x: number; y: number }) => void;
  onRegenerate?: (sectionId: string) => void;
  brandKits?: BrandKit[];
  onSaveBrandKit?: (name: string) => void;
  onApplyBrandKit?: (kit: BrandKit) => void;
  /** Page dimensions in CSS pixels. Defaults to Letter (816×1056) when absent. */
  format?: { width: number; height: number };
}

/** Section3 with optional version history */
export interface Section3WithVersions extends Section3 {
  versions?: { html: string; timestamp: number }[];
}

/** Cheap, stable string hash (cyrb53) to detect when a page's render inputs change. */
function hashStr(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function themeSignature(theme?: string, customColors?: CustomColors): string {
  return theme === "custom" ? `custom:${JSON.stringify(customColors ?? {})}` : theme ?? "minimal";
}

/**
 * Fetches server-rendered PNG thumbnails (one per page) and exposes them as blob URLs.
 * Replaces the old SVG-foreignObject capture, which produced black/blank thumbnails.
 * Pages are rendered serially (one in-flight request at a time) to avoid hammering the
 * server browser pool; a page is (re)rendered only when its HTML or the theme changes.
 */
function useServerThumbnails(
  documentId: string | undefined,
  sections: Section3[],
  theme?: string,
  customColors?: CustomColors,
  format?: { width: number; height: number }
) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const metaRef = useRef<Record<string, { hash: string; url: string }>>({});
  const queueRef = useRef<{ id: string; html: string; hash: string }[]>([]);
  const busyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Latest render params, read inside the fetch so processQueue stays stable.
  const paramsRef = useRef({ theme, customColors, format });
  paramsRef.current = { theme, customColors, format };

  const processQueue = useCallback(() => {
    if (!documentId || busyRef.current || queueRef.current.length === 0) return;
    busyRef.current = true;
    const item = queueRef.current.shift()!;
    const { theme, customColors, format } = paramsRef.current;

    fetch(`/api/v2/documents/${documentId}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: item.id, html: item.html, theme, customColors, format }),
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("thumb failed"))))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const prev = metaRef.current[item.id];
        if (prev?.url) URL.revokeObjectURL(prev.url);
        metaRef.current[item.id] = { hash: item.hash, url };
        setThumbs((p) => ({ ...p, [item.id]: url }));
        setFailed((p) => { if (!p.has(item.id)) return p; const n = new Set(p); n.delete(item.id); return n; });
      })
      .catch(() => {
        // Record the attempted hash so we don't retry identical content in a loop;
        // surface a placeholder instead of spinning forever.
        metaRef.current[item.id] = { hash: item.hash, url: "" };
        setFailed((p) => { const n = new Set(p); n.add(item.id); return n; });
      })
      .finally(() => {
        busyRef.current = false;
        processQueue();
      });
  }, [documentId]);

  const themeSig = themeSignature(theme, customColors);
  const formatSig = format ? `${format.width}x${format.height}` : "letter";

  useEffect(() => {
    if (!documentId) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const content = sections.filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__");
      let changed = false;
      for (const s of content) {
        const h = hashStr(`${s.html}|${themeSig}|${formatSig}`);
        const current = metaRef.current[s.id]?.hash;
        const queued = queueRef.current.some((q) => q.id === s.id && q.hash === h);
        if (current !== h && !queued) {
          queueRef.current = queueRef.current.filter((q) => q.id !== s.id);
          queueRef.current.push({ id: s.id, html: s.html, hash: h });
          setFailed((p) => { if (!p.has(s.id)) return p; const n = new Set(p); n.delete(s.id); return n; });
          changed = true;
        }
      }
      // Drop thumbnails for removed sections.
      const ids = new Set(content.map((s) => s.id));
      for (const id of Object.keys(metaRef.current)) {
        if (!ids.has(id)) {
          if (metaRef.current[id].url) URL.revokeObjectURL(metaRef.current[id].url);
          delete metaRef.current[id];
          setThumbs((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        }
      }
      if (changed) processQueue();
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [sections, themeSig, formatSig, processQueue]);

  // Revoke all blob URLs on unmount.
  useEffect(() => {
    return () => {
      for (const m of Object.values(metaRef.current)) if (m.url) URL.revokeObjectURL(m.url);
    };
  }, []);

  return { thumbs, failed };
}

export function PageList({
  documentId,
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
  onInsertAt,
  onDropImage,
  onExitPreview,
  onRegenerate,
  brandKits,
  onSaveBrandKit,
  onApplyBrandKit,
  format,
}: PageListProps) {
  const sorted = [...sections]
    .filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__")
    .sort((a, b) => a.order - b.order);
  const { thumbs, failed } = useServerThumbnails(documentId, sections, theme, customColors, format);
  const thumbAspect = format
    ? `${format.width} / ${format.height}`
    : "8.5 / 11";
  const dragRef = useRef<number | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [fileDragOver, setFileDragOver] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showThemes, setShowThemes] = useState(false);
  const [showSaveKit, setShowSaveKit] = useState(false);
  const [kitName, setKitName] = useState("");
  // Version navigation: index into versions array (undefined = current/active html)
  const [versionView, setVersionView] = useState<Record<string, number>>({});

  const themeRef = useRef<HTMLDivElement>(null);

  // Reset version navigation when versions array grows (e.g. after regeneration)
  const prevVersionCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const section of sections) {
      const sv = section as Section3WithVersions;
      const count = sv.versions?.length ?? 0;
      const prev = prevVersionCounts.current[section.id] ?? 0;
      if (count > prev && prev > 0) {
        // Versions grew — reset navigation to show latest (current)
        setVersionView((p) => {
          const next = { ...p };
          delete next[section.id];
          return next;
        });
      }
      prevVersionCounts.current[section.id] = count;
    }
  }, [sections]);

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
        {false && onThemeChange && (
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
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: t!.colors.primary }} />
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: t!.colors.accent }} />
                    </span>
                    {t!.label}
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
                      onThemeChange?.(t.id);
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
                          onThemeChange?.("custom");
                        }}
                        className={`w-full text-left text-xs font-bold flex items-center gap-2 ${theme === "custom" ? "text-brand-700" : ""}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-gray-300"
                          style={customColors?.primary ? { backgroundColor: customColors?.primary, borderColor: customColors?.primary } : undefined}
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
                                onChange={(e) => onCustomColorChange?.({ [c.key]: e.target.value })}
                              />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {/* Brand Kits section */}
                {brandKits && brandKits!.length > 0 && onApplyBrandKit && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Mis Brand Kits
                    </div>
                    {brandKits!.map((kit) => (
                      <button
                        key={kit.id}
                        onClick={() => {
                          onApplyBrandKit?.(kit);
                          setShowThemes(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-bold flex items-center gap-2 hover:bg-gray-50"
                      >
                        <span className="flex gap-0.5 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: kit.colors.primary }} />
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: kit.colors.accent }} />
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: kit.colors.secondary }} />
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: kit.colors.surface, border: '1px solid #e5e7eb' }} />
                        </span>
                        <span className="truncate">{kit.name}</span>
                        {kit.isDefault && <span className="text-[8px] text-brand-500 ml-auto">&#9733;</span>}
                      </button>
                    ))}
                  </>
                )}
                {/* Save as Brand Kit */}
                {onSaveBrandKit && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    {showSaveKit ? (
                      <div className="px-3 py-1.5">
                        <input
                          autoFocus
                          value={kitName}
                          onChange={(e) => setKitName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && kitName.trim()) {
                              onSaveBrandKit?.(kitName.trim());
                              setKitName("");
                              setShowSaveKit(false);
                              setShowThemes(false);
                            }
                            if (e.key === "Escape") setShowSaveKit(false);
                          }}
                          placeholder="Nombre del kit..."
                          className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none"
                        />
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => {
                              if (kitName.trim()) {
                                onSaveBrandKit?.(kitName.trim());
                                setKitName("");
                                setShowSaveKit(false);
                                setShowThemes(false);
                              }
                            }}
                            className="text-[10px] font-bold text-brand-600 hover:underline"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setShowSaveKit(false)}
                            className="text-[10px] font-bold text-gray-400 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSaveKit(true)}
                        className="w-full text-left px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50"
                      >
                        Guardar como Brand Kit
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-2 pb-2"
        onDragOver={(e) => {
          if (!onDropImage) return;
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setFileDragOver(null);
          }
        }}
        onDrop={(e) => {
          setFileDragOver(null);
          if (!onDropImage) return;
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith("image/")) {
            e.preventDefault();
            onDropImage(sorted.length, file);
          }
        }}
      >
        {sorted.map((section, idx) => {
          const isSelected = selectedSectionIds.includes(section.id);

          return (
            <React.Fragment key={section.id}>
            {/* Insert "+" button before/between pages — also acts as image drop zone */}
            {onInsertAt && (
              <div
                className={`flex justify-center py-2.5 transition-all ${fileDragOver === idx ? "bg-brand-50 rounded-lg ring-2 ring-brand-400 ring-dashed" : ""}`}
                onDragOver={(e) => {
                  if (!onDropImage || !e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setFileDragOver(idx);
                }}
                onDragLeave={() => setFileDragOver(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  setFileDragOver(null);
                  if (!onDropImage) return;
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith("image/")) {
                    e.preventDefault();
                    onDropImage(idx, file);
                  }
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onInsertAt(idx); }}
                  className={`w-7 h-7 rounded-full border-2 bg-white text-xl leading-none flex items-center justify-center transition-all ${
                    fileDragOver === idx
                      ? "border-brand-500 text-brand-500 shadow-[2px_2px_0_#9870ED]"
                      : "border-gray-300 text-gray-400 hover:border-black hover:text-black hover:shadow-[2px_2px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none"
                  }`}
                  title={`Insertar página en posición ${idx + 1}`}
                >
                  {fileDragOver === idx ? "📷" : "+"}
                </button>
              </div>
            )}
            <div
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
              {/* Thumbnail — static captured image */}
              <div className="relative">
                <div
                  className="w-full bg-white rounded-t-lg border border-gray-200 relative overflow-hidden"
                  style={{ aspectRatio: thumbAspect, zIndex: 1 }}
                >
                  {thumbs[section.id] ? (
                    <img
                      src={thumbs[section.id]}
                      alt={section.label || `Página ${idx + 1}`}
                      className="absolute inset-0 w-full h-full object-cover object-top"
                      draggable={false}
                    />
                  ) : documentId && !failed.has(section.id) ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300 text-2xl font-bold">
                      {idx + 1}
                    </div>
                  )}
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
                        const newIdx = viewIdx !== undefined ? viewIdx - 1 : versions.length - 1;
                        setVersionView((p) => ({ ...p, [section.id]: newIdx }));
                        onNavigateVersion?.(section.id, versions[newIdx].html);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-brand-600 disabled:opacity-30 disabled:cursor-default text-[10px]"
                    >
                      &#9664;
                    </button>
                    <span className={`text-[9px] font-bold tabular-nums ${viewIdx !== undefined ? "text-purple-500" : "text-gray-500"}`}>
                      V{currentPos}/{total}
                    </span>
                    <button
                      disabled={isLast}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (viewIdx !== undefined) {
                          const newIdx = viewIdx + 1;
                          if (newIdx >= versions.length) {
                            // Back to current
                            setVersionView((p) => {
                              const next = { ...p };
                              delete next[section.id];
                              return next;
                            });
                            onExitPreview?.(section.id);
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
                    {viewIdx !== undefined && onRestoreVersion && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestoreVersion(section.id, versions[viewIdx].html);
                          setVersionView((p) => {
                            const next = { ...p };
                            delete next[section.id];
                            return next;
                          });
                        }}
                        className="text-[8px] font-bold text-purple-600 hover:text-purple-800 px-1 py-0.5 rounded bg-purple-50 hover:bg-purple-100 transition-colors ml-0.5"
                      >
                        Restaurar
                      </button>
                    )}
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
                <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {onRegenerate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(section.id);
                      }}
                      className="w-6 h-6 md:w-4 md:h-4 flex items-center justify-center rounded text-gray-400 hover:text-brand-600 hover:bg-brand-50 text-xs md:text-[9px]"
                      title="Regenerar p&aacute;gina"
                    >
                      &#10022;
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCode(section.id);
                    }}
                    className="w-6 h-6 md:w-4 md:h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-xs md:text-[9px]"
                    title="Ver c&oacute;digo"
                  >
                    &lt;/&gt;
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(section.id);
                    }}
                    className="w-6 h-6 md:w-4 md:h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 text-xs md:text-[9px]"
                    title="Eliminar p&aacute;gina"
                  >
                    &times;
                  </button>
                </div>
              </div>
            </div>
            </React.Fragment>
          );
        })}
        {/* Insert "+" after last page */}
        {onInsertAt && sorted.length > 0 && (
          <div
            className={`flex justify-center py-1 transition-all ${fileDragOver === sorted.length ? "bg-brand-50 rounded-lg ring-2 ring-brand-400 ring-dashed" : ""}`}
            onDragOver={(e) => {
              if (!onDropImage || !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.stopPropagation();
              setFileDragOver(sorted.length);
            }}
            onDragLeave={() => setFileDragOver(null)}
            onDrop={(e) => {
              e.stopPropagation();
              setFileDragOver(null);
              if (!onDropImage) return;
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) {
                e.preventDefault();
                onDropImage(sorted.length, file);
              }
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onInsertAt(sorted.length); }}
              className={`w-7 h-7 rounded-full border-2 bg-white text-xl leading-none flex items-center justify-center transition-all ${
                fileDragOver === sorted.length
                  ? "border-brand-500 text-brand-500 shadow-[2px_2px_0_#9870ED]"
                  : "border-gray-300 text-gray-400 hover:border-black hover:text-black hover:shadow-[2px_2px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none"
              }`}
              title={`Insertar página al final`}
            >
              {fileDragOver === sorted.length ? "📷" : "+"}
            </button>
          </div>
        )}
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
