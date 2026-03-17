import { useEffect, useState, useRef, useCallback } from "react";
import { twMerge } from "tailwind-merge";
import type { Editor } from "grapesjs";

interface Props {
  editor: Editor | null;
  /** Bumped when theme/customColors change — forces color preview re-resolve */
  themeVersion?: number;
  /** Resolved theme colors keyed by semantic name (e.g. "primary" → "#6366f1") */
  themeColors?: Record<string, string>;
}

interface ClassCategory {
  label: string;
  classes: string[];
}

const CATEGORIES: { id: string; label: string; test: (c: string) => boolean }[] = [
  { id: "layout", label: "Layout", test: (c) => /^(flex|grid|block|inline|hidden|col-|row-|justify-|items-|self-|overflow-|order-|relative|absolute|fixed|sticky|inset-|top-|right-|bottom-|left-|z-|container)/.test(c) },
  { id: "spacing", label: "Spacing", test: (c) => /^(p-|px-|py-|pt-|pr-|pb-|pl-|m-|mx-|my-|mt-|mr-|mb-|ml-|gap-|space-)/.test(c) },
  { id: "sizing", label: "Sizing", test: (c) => /^(w-|h-|min-w-|max-w-|min-h-|max-h-|size-)/.test(c) },
  { id: "typography", label: "Typography", test: (c) => /^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|center|right|justify|wrap|nowrap|ellipsis|balance)|font-|leading-|tracking-|uppercase|lowercase|capitalize|italic|not-italic|truncate|line-clamp|whitespace-)/.test(c) },
  { id: "colors", label: "Colors", test: (c) => /^(bg-|text-(?!xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|center|right|justify|wrap|nowrap|ellipsis|balance)|from-|to-|via-|decoration-)/.test(c) },
  { id: "borders", label: "Borders", test: (c) => /^(border|rounded|ring-|divide-|outline-)/.test(c) },
  { id: "effects", label: "Effects", test: (c) => /^(shadow|opacity-|blur-|transition|duration-|ease-|animate-|transform|scale-|rotate-|translate-|hover:|focus:|active:|group-)/.test(c) },
];

function categorize(classes: string[]): ClassCategory[] {
  const buckets: Record<string, string[]> = {};
  const other: string[] = [];

  for (const cls of classes) {
    let matched = false;
    for (const cat of CATEGORIES) {
      // Strip responsive prefix for matching
      const bare = cls.replace(/^(sm:|md:|lg:|xl:|2xl:)/, "");
      if (cat.test(bare)) {
        (buckets[cat.id] ??= []).push(cls);
        matched = true;
        break;
      }
    }
    if (!matched) other.push(cls);
  }

  const result: ClassCategory[] = [];
  for (const cat of CATEGORIES) {
    if (buckets[cat.id]?.length) {
      result.push({ label: cat.label, classes: buckets[cat.id] });
    }
  }
  if (other.length) result.push({ label: "Other", classes: other });
  return result;
}

// Semantic theme color hints — grouped by property
const THEME_HINTS: { label: string; prefix: string; colors: { cls: string; name: string }[] }[] = [
  {
    label: "Texto", prefix: "text-",
    colors: [
      { cls: "text-on-primary", name: "on-primary" }, { cls: "text-on-secondary", name: "on-secondary" },
      { cls: "text-on-accent", name: "on-accent" }, { cls: "text-on-surface", name: "on-surface" },
      { cls: "text-on-surface-muted", name: "on-surface-muted" },
    ],
  },
  {
    label: "Fondo", prefix: "bg-",
    colors: [
      { cls: "bg-primary", name: "primary" }, { cls: "bg-primary-light", name: "primary-light" },
      { cls: "bg-primary-dark", name: "primary-dark" }, { cls: "bg-secondary", name: "secondary" },
      { cls: "bg-accent", name: "accent" }, { cls: "bg-surface", name: "surface" },
      { cls: "bg-surface-alt", name: "surface-alt" },
    ],
  },
  {
    label: "Borde", prefix: "border-",
    colors: [
      { cls: "border-primary", name: "primary" }, { cls: "border-secondary", name: "secondary" },
      { cls: "border-accent", name: "accent" }, { cls: "border-surface-alt", name: "surface-alt" },
    ],
  },
];

// Curated autocomplete list
const COMMON_CLASSES = [
  // Layout
  "flex", "flex-col", "flex-row", "flex-wrap", "grid", "grid-cols-2", "grid-cols-3", "grid-cols-4",
  "block", "inline-block", "hidden", "relative", "absolute", "fixed", "sticky",
  "justify-start", "justify-center", "justify-end", "justify-between", "justify-around",
  "items-start", "items-center", "items-end", "items-stretch",
  "overflow-hidden", "overflow-auto", "z-10", "z-20", "z-50",
  // Spacing
  "p-0", "p-1", "p-2", "p-3", "p-4", "p-6", "p-8", "p-10", "p-12", "p-16", "p-20",
  "px-2", "px-4", "px-6", "px-8", "px-10", "px-12", "px-16",
  "py-2", "py-4", "py-6", "py-8", "py-10", "py-12", "py-16", "py-20", "py-24",
  "m-0", "m-auto", "mx-auto", "my-2", "my-4", "my-6", "my-8",
  "mt-2", "mt-4", "mt-6", "mt-8", "mb-2", "mb-4", "mb-6", "mb-8",
  "gap-1", "gap-2", "gap-3", "gap-4", "gap-6", "gap-8", "gap-10", "gap-12",
  "space-x-2", "space-x-4", "space-y-2", "space-y-4", "space-y-6",
  // Sizing
  "w-full", "w-auto", "w-1/2", "w-1/3", "w-2/3", "w-1/4", "w-3/4", "w-screen",
  "w-8", "w-10", "w-12", "w-16", "w-20", "w-24", "w-32", "w-48", "w-64",
  "h-full", "h-auto", "h-screen", "h-8", "h-10", "h-12", "h-16", "h-20", "h-24", "h-32", "h-48", "h-64",
  "max-w-sm", "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-4xl", "max-w-6xl", "max-w-7xl", "max-w-full",
  "min-h-screen", "min-h-0",
  // Typography
  "text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl",
  "font-thin", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black",
  "text-left", "text-center", "text-right", "leading-tight", "leading-normal", "leading-relaxed",
  "tracking-tight", "tracking-normal", "tracking-wide", "uppercase", "lowercase", "capitalize", "italic", "truncate",
  // Colors (semantic)
  "bg-primary", "bg-primary-light", "bg-primary-dark", "bg-secondary", "bg-accent", "bg-surface", "bg-surface-alt",
  "text-on-primary", "text-on-secondary", "text-on-accent", "text-on-surface", "text-on-surface-muted",
  // Colors (common)
  "bg-white", "bg-black", "bg-transparent", "bg-gray-50", "bg-gray-100", "bg-gray-200", "bg-gray-800", "bg-gray-900",
  "text-white", "text-black", "text-gray-300", "text-gray-400", "text-gray-500", "text-gray-600", "text-gray-700", "text-gray-900",
  // Borders
  "border", "border-0", "border-2", "border-4", "border-t", "border-b",
  "border-gray-200", "border-gray-300", "border-gray-700",
  "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-full", "rounded-none",
  "ring-1", "ring-2", "ring-4",
  // Effects
  "shadow-sm", "shadow", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl", "shadow-none",
  "opacity-0", "opacity-50", "opacity-75", "opacity-100",
  "transition", "transition-all", "transition-colors", "duration-150", "duration-200", "duration-300",
  "hover:opacity-80", "hover:scale-105", "hover:shadow-lg",
  "animate-pulse", "animate-bounce",
  // Misc
  "cursor-pointer", "select-none", "object-cover", "object-contain", "aspect-square", "aspect-video",
];

export default function TailwindClassEditor({ editor, themeVersion = 0, themeColors = {} }: Props) {
  const [classes, setClasses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const readClasses = useCallback((component: any) => {
    if (!component) return [];
    // Read from GrapesJS model attributes (authoritative source)
    const attrs = component.getAttributes?.() || {};
    const modelClass = attrs.class || "";
    if (modelClass) {
      return modelClass.split(/\s+/).filter((c: string) => c && !c.startsWith("gjs-"));
    }
    // Fallback to DOM element
    const el = component.getEl?.();
    if (!el) return [];
    return (el.className || "")
      .split(/\s+/)
      .filter((c: string) => c && !c.startsWith("gjs-"));
  }, []);

  const writeClasses = useCallback((component: any, newClasses: string[]) => {
    if (!component) return;
    const merged = twMerge(newClasses.join(" "));
    const el = component.getEl();
    if (!el) return;
    // Preserve gjs-* classes
    const gjsClasses = (el.className || "").split(/\s+/).filter((c: string) => c.startsWith("gjs-"));
    const finalClassName = [...gjsClasses, ...merged.split(/\s+/).filter(Boolean)].join(" ");
    el.className = finalClassName;
    // Sync to GrapesJS model
    const attrs = component.getAttributes();
    attrs.class = merged;
    component.setAttributes(attrs);
    setClasses(merged.split(/\s+/).filter(Boolean));
  }, []);

  useEffect(() => {
    if (!editor) return;
    const onSelected = (component: any) => {
      setSelectedComponent(component);
      setClasses(readClasses(component));
      setSearch("");
    };
    const onDeselected = () => {
      setSelectedComponent(null);
      setClasses([]);
    };
    // Also refresh when component updates
    const onUpdate = (component: any) => {
      if (component === selectedComponent || editor.getSelected() === component) {
        setClasses(readClasses(component));
      }
    };

    editor.on("component:selected", onSelected);
    editor.on("component:deselected", onDeselected);
    editor.on("component:update", onUpdate);

    // Init with current selection
    const current = editor.getSelected();
    if (current) onSelected(current);

    return () => {
      editor.off("component:selected", onSelected);
      editor.off("component:deselected", onDeselected);
      editor.off("component:update", onUpdate);
    };
  }, [editor, readClasses, selectedComponent]);

  const removeClass = (cls: string) => {
    if (!selectedComponent) return;
    writeClasses(selectedComponent, classes.filter((c) => c !== cls));
  };

  const addClass = (cls: string) => {
    if (!selectedComponent || !cls.trim()) return;
    writeClasses(selectedComponent, [...classes, cls.trim()]);
    setSearch("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const filteredSuggestions = search.trim()
    ? COMMON_CLASSES.filter(
        (c) => c.includes(search.trim().toLowerCase()) && !classes.includes(c)
      ).slice(0, 20)
    : [];

  const categories = categorize(classes);

  // Resolve color for color classes
  const getColorPreview = (cls: string): string | null => {
    if (!editor || !selectedComponent) return null;
    const bare = cls.replace(/^(sm:|md:|lg:|xl:|2xl:)/, "");
    if (!/^(bg-|text-|from-|to-|via-|border-)/.test(bare)) return null;
    // Skip non-color text- classes
    if (/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|left|center|right)/.test(bare)) return null;
    try {
      const doc = editor.Canvas.getDocument();
      const win = doc?.defaultView;
      if (!win) return null;
      // Create a temporary element to resolve the color
      const tmp = doc.createElement("div");
      tmp.className = cls;
      tmp.style.position = "absolute";
      tmp.style.visibility = "hidden";
      doc.body.appendChild(tmp);
      const computed = win.getComputedStyle(tmp);
      const color = bare.startsWith("text-") || bare.startsWith("decoration-")
        ? computed.color
        : bare.startsWith("border-")
          ? computed.borderColor
          : computed.backgroundColor;
      doc.body.removeChild(tmp);
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
    } catch { /* ignore */ }
    return null;
  };

  if (!selectedComponent) {
    return (
      <div className="p-4 text-center text-gray-500 text-xs">
        <p className="mb-1 text-base">◎</p>
        Selecciona un elemento para editar sus clases Tailwind
      </div>
    );
  }

  const tagName = selectedComponent.get?.("tagName") || "div";

  return (
    <div className="flex flex-col h-full">
      {/* Header with tag name */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
        <code className="text-[11px] bg-gray-800 text-brand-400 px-1.5 py-0.5 rounded font-mono">
          &lt;{tagName}&gt;
        </code>
        <span className="text-[10px] text-gray-500">{classes.length} clases</span>
      </div>

      {/* Search input */}
      <div className="px-3 py-2 border-b border-gray-700 relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) {
              if (filteredSuggestions.length > 0) {
                addClass(filteredSuggestions[0]);
              } else {
                addClass(search.trim());
              }
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
              setSearch("");
            }
          }}
          placeholder="Agregar clase..."
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-3 right-3 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-48 overflow-auto"
          >
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addClass(s);
                }}
                onClick={() => addClass(s)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors font-mono"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Class pills grouped by category */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {categories.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">Sin clases Tailwind</p>
        )}
        {categories.map((cat) => (
          <div key={cat.label}>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">
              {cat.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {cat.classes.map((cls) => {
                const color = getColorPreview(cls);
                return (
                  <span
                    key={cls}
                    className="inline-flex items-center gap-1 bg-gray-800 border border-gray-600 rounded-md px-2 py-0.5 text-[11px] font-mono text-gray-300 hover:border-gray-400 group"
                  >
                    {color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-gray-500 shrink-0"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    {cls}
                    <button
                      onClick={() => removeClass(cls)}
                      className="text-gray-600 hover:text-red-400 transition-colors ml-0.5 opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ))}

        {/* Theme color hints */}
        <div className="border-t border-gray-700 pt-3 mt-1 space-y-2.5">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Colores del tema</p>
          {THEME_HINTS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] text-gray-600 mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.colors.map(({ cls, name }) => {
                  // Resolve from themeColors prop (instant) — extract semantic name from class
                  const semanticName = cls.replace(/^(bg-|text-|border-)/, "");
                  const color = themeColors[semanticName] || getColorPreview(cls);
                  const isActive = classes.includes(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => isActive ? removeClass(cls) : addClass(cls)}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono transition-all ${
                        isActive
                          ? "bg-brand-500/20 border border-brand-500 text-brand-300"
                          : "bg-gray-800/60 border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                      title={cls}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-gray-600 shrink-0"
                        style={{ backgroundColor: color || "#666" }}
                      />
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
