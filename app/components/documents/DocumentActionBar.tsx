/**
 * Brutalist action bar for the per-page document editor (early-adopter ?canvas=1).
 *
 * Prototype of the standardized editor toolbar. Brutalism styling (border-2 border-black,
 * brand-500, offset shadow) instead of GrapesJS grays. Features:
 *  - raw Tailwind class editor (chips + add) with light autocomplete + responsive prefix
 *  - theme color swatches (transparent / b&w / tokens) applied as classes
 *  - tag switch, element attributes (img src/alt, link href), AI refine, view code, delete
 *
 * Once validated here it gets ported to the SDK FloatingToolbar so share + dash share one
 * standard toolbar.
 */
import { useState, useEffect, useRef } from "react";
import { cn } from "~/utils/cn";
import type { IframeMessage } from "~/lib/landing3/types";

interface Props {
  selection: IframeMessage | null;
  iframeRect: DOMRect | null;
  themeColors?: Record<string, string>;
  isRefining?: boolean;
  onApplyClasses: (classes: string[]) => void;
  onChangeTag: (newTag: string) => void;
  onUpdateAttribute: (attr: string, value: string) => void;
  onRefine: (instruction: string) => void;
  onDeleteElement: () => void;
  onViewCode: () => void;
  onClose: () => void;
}

const HEADINGS = ["H1", "H2", "H3", "H4", "H5", "H6"];
const TEXT = ["P", "SPAN", "DIV", "BLOCKQUOTE"];
const CONTAINERS = ["DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "MAIN"];
const NO_SWITCH = ["A", "IMG", "INPUT", "BUTTON", "SVG", "VIDEO", "IFRAME", "TABLE", "UL", "OL", "LI", "FORM"];

const COLOR_TOKENS = ["primary", "secondary", "accent", "surface"];
const BREAKPOINTS = ["", "sm", "md", "lg", "xl"];

// Curated common utilities for the class autocomplete (full Tailwind vocab is huge; this
// covers the everyday set so the input is discoverable without bundling the whole list).
const SUGGESTIONS = [
  "flex", "grid", "block", "inline-block", "hidden", "flex-col", "flex-row", "flex-wrap",
  "items-center", "items-start", "items-end", "justify-center", "justify-between", "justify-start", "justify-end",
  "gap-1", "gap-2", "gap-4", "gap-6", "gap-8", "gap-12",
  "p-2", "p-4", "p-6", "p-8", "px-4", "px-6", "py-2", "py-4", "m-2", "m-4", "mx-auto", "mt-2", "mt-4", "mb-2", "mb-4",
  "w-full", "w-1/2", "w-1/3", "h-full", "max-w-md", "max-w-lg", "max-w-xl", "max-w-3xl", "min-h-screen",
  "text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl",
  "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-black",
  "text-left", "text-center", "text-right", "uppercase", "lowercase", "capitalize", "italic",
  "leading-none", "leading-tight", "leading-relaxed", "tracking-tight", "tracking-wide", "tracking-widest",
  "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-full",
  "border", "border-2", "border-4", "shadow", "shadow-md", "shadow-lg", "shadow-xl",
  "relative", "absolute", "fixed", "inset-0", "z-10", "z-20", "opacity-50", "opacity-75",
  "object-cover", "object-contain", "overflow-hidden", "aspect-square", "aspect-video",
];

export function DocumentActionBar({
  selection,
  iframeRect,
  themeColors,
  isRefining,
  onApplyClasses,
  onChangeTag,
  onUpdateAttribute,
  onRefine,
  onDeleteElement,
  onViewCode,
  onClose,
}: Props) {
  const [classInput, setClassInput] = useState("");
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showTags, setShowTags] = useState(false);
  const [prefix, setPrefix] = useState("");
  const classInputRef = useRef<HTMLInputElement>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [imgSrc, setImgSrc] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClassInput(""); setEditingClass(null); setShowTags(false); setAiPrompt("");
    setImgSrc(selection?.attrs?.src || "");
    setImgAlt(selection?.attrs?.alt || "");
    setLinkHref(selection?.attrs?.href || "");
  }, [selection?.sectionId, selection?.elementPath, selection?.attrs]);

  // Close the tag dropdown on outside click / Escape.
  useEffect(() => {
    if (!showTags) return;
    const onDown = (e: MouseEvent) => { if (tagRef.current && !tagRef.current.contains(e.target as Node)) setShowTags(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowTags(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showTags]);

  if (!selection || !selection.rect || !iframeRect) return null;

  const classes = (selection.className || "").split(/\s+/).filter(Boolean);
  const tag = (selection.tagName || "").toUpperCase();
  const isImg = tag === "IMG";
  const isLink = tag === "A";

  let tagOptions: string[] = [];
  if (HEADINGS.includes(tag)) tagOptions = [...HEADINGS, "P"];
  else if (TEXT.includes(tag) && !CONTAINERS.includes(tag)) tagOptions = [...TEXT, "H1", "H2", "H3"];
  else if (CONTAINERS.includes(tag)) tagOptions = [...CONTAINERS, "P", "SPAN"];
  tagOptions = tagOptions.filter((t) => t !== tag);
  const canSwitch = !NO_SWITCH.includes(tag) && tagOptions.length > 0;

  const estHeight = 184;
  const below = iframeRect.top + selection.rect.top + selection.rect.height + 8;
  const above = iframeRect.top + selection.rect.top - estHeight - 8;
  const top = below + estHeight > window.innerHeight - 8 && above > 8 ? above : below;
  const left = Math.max(8, Math.min(iframeRect.left + selection.rect.left, window.innerWidth - 400));

  // cn() = clsx + tailwind-merge: resolves conflicts per utility group (incl. responsive
  // variants) so adding a class substitutes the conflicting one instead of stacking.
  const apply = (base: string[], ...extra: string[]) =>
    onApplyClasses(cn(base.join(" "), ...extra).split(/\s+/).filter(Boolean));
  const withPrefix = (c: string) => (prefix ? `${prefix}:${c}` : c);

  // × removes; clicking the chip name loads it into the input to edit (then replaces it).
  const removeClass = (cls: string) => {
    onApplyClasses(classes.filter((c) => c !== cls));
    if (editingClass === cls) { setEditingClass(null); setClassInput(""); }
  };
  const startEdit = (cls: string) => {
    setEditingClass(cls); setClassInput(cls); setActiveIdx(-1);
    requestAnimationFrame(() => {
      const el = classInputRef.current;
      if (el) { el.focus(); el.setSelectionRange(cls.length, cls.length); }
    });
  };
  const addClasses = (raw?: string) => {
    const src = (raw ?? classInput).trim();
    if (src) {
      if (editingClass) apply(classes.filter((c) => c !== editingClass), ...src.split(/\s+/));
      else apply(classes, ...src.split(/\s+/).map(withPrefix));
    }
    setClassInput(""); setEditingClass(null);
  };
  const applyColor = (mode: "text" | "bg", token: string) => apply(classes, withPrefix(`${mode}-${token}`));
  const submitRefine = () => { if (aiPrompt.trim() && !isRefining) { onRefine(aiPrompt.trim()); setAiPrompt(""); } };

  const swatches: { token: string; css: string; transparent?: boolean }[] = [
    { token: "transparent", css: "transparent", transparent: true },
    { token: "white", css: "#ffffff" },
    { token: "black", css: "#000000" },
    ...COLOR_TOKENS.map((t) => ({ token: t, css: themeColors?.[t] || "#cccccc" })),
  ];

  const suggestions = classInput.trim()
    ? SUGGESTIONS.filter((s) => s.includes(classInput.trim().toLowerCase()) && !classes.includes(withPrefix(s))).slice(0, 8)
    : [];

  const attrInput = (label: string, value: string, set: (v: string) => void, attr: string) => (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 w-7 shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onUpdateAttribute(attr, value); }}
        onBlur={() => onUpdateAttribute(attr, value)}
        className="flex-1 border-2 border-black/30 rounded px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-brand-500 min-w-0"
        placeholder={`${attr}…`}
      />
    </div>
  );

  return (
    <div
      className="fixed z-50 flex flex-col gap-1.5 bg-white text-black rounded-xl border-2 border-black px-2.5 py-2 shadow-[4px_4px_0_0_#000]"
      style={{ top, left, width: "min(460px, calc(100vw - 16px))" }}
    >
      {/* Row 1 — tag + actions */}
      <div className="flex items-center gap-1.5">
        <div ref={tagRef} className="relative shrink-0">
          <button
            onClick={() => canSwitch && setShowTags((s) => !s)}
            className={`px-2 py-0.5 rounded-md border-2 border-black text-[10px] font-mono font-black uppercase tracking-wider flex items-center gap-0.5 ${canSwitch ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-100 text-black cursor-default"}`}
          >
            {tag.toLowerCase()}
            {canSwitch && <span className="opacity-70">▾</span>}
          </button>
          {showTags && canSwitch && (
            <div className="absolute left-0 top-full mt-1 bg-white border-2 border-black rounded-lg shadow-[3px_3px_0_0_#000] py-1 z-50 min-w-[4rem] max-h-[200px] overflow-y-auto">
              {tagOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => { onChangeTag(t.toLowerCase()); setShowTags(false); }}
                  className="block w-full text-left px-3 py-1 text-[11px] font-mono font-bold uppercase hover:bg-brand-50"
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold text-gray-400 truncate flex-1">{(selection.text || "").slice(0, 36)}</span>
        <button onClick={onViewCode} title="Ver código" className="w-7 h-7 flex items-center justify-center rounded-md border-2 border-black bg-white hover:bg-brand-50 font-mono text-xs font-black shrink-0">{"</>"}</button>
        <button onClick={onDeleteElement} title="Eliminar elemento" className="w-7 h-7 flex items-center justify-center rounded-md border-2 border-black bg-white hover:bg-red-100 text-red-600 shrink-0" aria-label="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
        <button onClick={onClose} title="Cerrar" className="w-7 h-7 flex items-center justify-center rounded-md border-2 border-black bg-white hover:bg-gray-100 font-black shrink-0" aria-label="Cerrar">×</button>
      </div>

      {/* Row 2 — AI refine (section-level) */}
      <div className="flex items-center gap-1.5 border-t-2 border-black/10 pt-1.5">
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitRefine(); } }}
          disabled={isRefining}
          placeholder="Refinar esta página con AI…"
          className="flex-1 border-2 border-black/30 rounded px-2 py-1 text-[11px] outline-none focus:border-brand-500 min-w-0 disabled:opacity-50"
        />
        <button
          onClick={submitRefine}
          disabled={isRefining || !aiPrompt.trim()}
          className="px-2.5 py-1 rounded-md border-2 border-black bg-brand-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-brand-600 disabled:opacity-40 shrink-0 flex items-center gap-1"
        >
          {isRefining ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : "✦"}
          {isRefining ? "" : "AI"}
        </button>
      </div>

      {/* Row 3 — attributes (img / link) */}
      {(isImg || isLink) && (
        <div className="flex flex-col gap-1 border-t-2 border-black/10 pt-1.5">
          {isImg && attrInput("src", imgSrc, setImgSrc, "src")}
          {isImg && attrInput("alt", imgAlt, setImgAlt, "alt")}
          {isLink && attrInput("href", linkHref, setLinkHref, "href")}
        </div>
      )}

      {/* Row 4 — Tailwind class editor (prefix + chips + add + autocomplete) */}
      <div className="relative flex items-center gap-1 flex-wrap border-t-2 border-black/10 pt-1.5">
        <span className="text-[9px] font-black uppercase tracking-wider text-brand-600 mr-0.5 shrink-0">clases</span>
        <select
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          title="Prefijo responsive para clases nuevas"
          className="text-[10px] font-mono font-bold border-2 border-black rounded px-1 py-0.5 bg-white shrink-0"
        >
          {BREAKPOINTS.map((b) => <option key={b} value={b}>{b ? `${b}:` : "base"}</option>)}
        </select>
        {classes.map((cls) => (
          <span
            key={cls}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border-2 border-black text-[10px] font-mono font-bold transition-colors ${editingClass === cls ? "bg-brand-100 ring-1 ring-brand-500" : "bg-white"}`}
          >
            <button onClick={() => startEdit(cls)} title="Editar clase" className="hover:text-brand-600">{cls}</button>
            <button onClick={() => removeClass(cls)} title="Quitar clase" aria-label="Quitar clase" className="text-gray-400 hover:text-red-600 font-black leading-none">×</button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[90px]">
          <input
            ref={classInputRef}
            value={classInput}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={activeIdx >= 0 ? `cls-opt-${activeIdx}` : undefined}
            onChange={(e) => { setClassInput(e.target.value); setActiveIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
              else if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); addClasses(activeIdx >= 0 ? suggestions[activeIdx] : undefined); setActiveIdx(-1); }
              else if (e.key === "Escape") { setClassInput(""); setEditingClass(null); setActiveIdx(-1); }
            }}
            placeholder={editingClass ? "editando clase…" : "+ clase…"}
            className={`w-full border-2 rounded px-1.5 py-0.5 text-[10px] font-mono outline-none ${editingClass ? "border-solid border-brand-500" : "border-dashed border-black/30 focus:border-brand-500"}`}
          />
          {suggestions.length > 0 && (
            <ul role="listbox" className="absolute left-0 top-full mt-1 z-50 bg-white border-2 border-black rounded-lg shadow-[4px_4px_0_0_#000] py-1 min-w-[140px] max-h-[180px] overflow-y-auto">
              {suggestions.map((s, i) => (
                <li key={s} id={`cls-opt-${i}`} role="option" aria-selected={i === activeIdx}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); addClasses(s); setActiveIdx(-1); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`block w-full text-left px-2.5 py-1.5 text-[11px] font-mono font-bold transition-colors ${i === activeIdx ? "bg-brand-500 text-white" : "text-black hover:bg-brand-100"}`}
                  >
                    {prefix ? `${prefix}:` : ""}{s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row 5 — color swatches (text / bg) */}
      {(["text", "bg"] as const).map((mode) => (
        <div key={mode} className="flex items-center gap-1 border-t-2 border-black/10 pt-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 w-5 shrink-0">{mode === "text" ? "Aa" : "BG"}</span>
          {swatches.map(({ token, css, transparent }) => (
            <button
              key={token}
              onClick={() => applyColor(mode, token)}
              title={`${withPrefix(`${mode}-${token}`)}`}
              className="w-5 h-5 rounded border-2 border-black hover:scale-110 transition-transform shrink-0"
              style={transparent
                ? { backgroundImage: "repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%)", backgroundSize: "8px 8px" }
                : { background: css }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default DocumentActionBar;
