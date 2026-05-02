/**
 * Lightweight inspector for share-edit mode. Replaces FloatingToolbar entirely so we
 * don't fight with its AI-centric architecture. One job: let the invitee see what
 * Tailwind classes an element has and add/remove them directly.
 *
 * State: a single useState for the input field. Selection comes from the parent —
 * cero estado redundante.
 */
import { useEffect, useRef, useState } from "react";
import type { IframeMessage } from "~/lib/landing3/types";

interface Props {
  selection: IframeMessage | null;
  iframeRect: DOMRect | null;
  themeColors?: { primary: string; secondary: string; accent: string; surface: string };
  onApplyClasses: (args: { add?: string[]; remove?: string[] }) => void;
  onUpdateAttribute: (attr: string, value: string) => void;
  onDeleteElement: () => void;
  onClose: () => void;
}

/** Strip a set of CSS properties from an inline style string, keeping the rest. */
function stripInlineProps(style: string, propsToStrip: string[]): string {
  if (!style) return "";
  const lower = propsToStrip.map((p) => p.toLowerCase());
  return style
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim().toLowerCase();
      return prop ? !lower.includes(prop) : true;
    })
    .join("; ");
}

const CONTAINER_TAGS = ["DIV", "SECTION", "HEADER", "FOOTER", "NAV", "ASIDE", "MAIN", "ARTICLE"];
const TEXT_COLOR_PREFIXES = ["text-primary", "text-secondary", "text-accent", "text-on-surface", "text-on-primary", "text-on-surface-muted", "text-white", "text-black", "text-transparent"];
const BG_COLOR_PREFIXES = ["bg-primary", "bg-primary-dark", "bg-secondary", "bg-accent", "bg-surface", "bg-surface-alt", "bg-white", "bg-black", "bg-transparent"];

const FIXED_SWATCHES = [
  { color: "#ffffff", bgCls: "bg-white", textCls: "text-white", label: "Blanco" },
  { color: "#000000", bgCls: "bg-black", textCls: "text-black", label: "Negro" },
  { color: "transparent", bgCls: "bg-transparent", textCls: "text-transparent", label: "Transparente" },
];

export default function ShareInspector({
  selection,
  iframeRect,
  themeColors,
  onApplyClasses,
  onUpdateAttribute,
  onDeleteElement,
  onClose,
}: Props) {
  const [classInput, setClassInput] = useState("");
  const inspectorRef = useRef<HTMLDivElement>(null);

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset input when selection changes
  useEffect(() => {
    setClassInput("");
  }, [selection?.sectionId, selection?.elementPath]);

  if (!selection || !selection.rect || !iframeRect) return null;

  const tag = (selection.tagName || "").toUpperCase();
  const classes = (selection.className || "").split(/\s+/).filter(Boolean);
  const isContainer = CONTAINER_TAGS.includes(tag);

  // Position — same logic as FloatingToolbar but trimmed.
  const inspectorWidth = inspectorRef.current?.offsetWidth || 480;
  const inspectorHeight = inspectorRef.current?.offsetHeight || 100;
  const top = iframeRect.top + selection.rect.top + selection.rect.height + 8;
  const left = iframeRect.left + selection.rect.left;
  const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - inspectorWidth - 8));
  const showAbove = top + inspectorHeight + 8 > window.innerHeight;
  const finalTop = Math.max(8, showAbove ? iframeRect.top + selection.rect.top - inspectorHeight - 8 : top);

  function submitInput() {
    const tokens = classInput.split(/\s+/).filter(Boolean);
    console.log("[share/inspector] submitInput", { tokens });
    if (tokens.length === 0) return;
    onApplyClasses({ add: tokens });
    setClassInput("");
  }

  function applySwatch(mode: "text" | "bg", token: string) {
    const removePrefixes = mode === "text" ? TEXT_COLOR_PREFIXES : BG_COLOR_PREFIXES;
    // Strip any existing class that matches the prefixes (exact or starting with).
    const toRemove = classes.filter((c) => {
      const bare = c.includes(":") ? c.substring(c.lastIndexOf(":") + 1) : c;
      return removePrefixes.some((pfx) => bare === pfx || bare.startsWith(pfx));
    });
    onApplyClasses({ add: [token], remove: toRemove });

    // Inline style with a hardcoded color overrides Tailwind classes via CSS specificity.
    // Strip just the conflicting CSS prop so the swatch's class actually paints.
    const inlineStyle = (selection!.attrs?.style as string | undefined) || "";
    if (inlineStyle) {
      const stripProps = mode === "text"
        ? ["color"]
        : ["background", "background-color"];
      const cleaned = stripInlineProps(inlineStyle, stripProps);
      if (cleaned !== inlineStyle) {
        onUpdateAttribute("style", cleaned);
      }
    }
  }

  return (
    <div
      ref={inspectorRef}
      className="fixed z-50 flex flex-col bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-1.5 border border-gray-700 gap-1"
      style={{ top: finalTop, left: clampedLeft, width: "min(560px, calc(100vw - 16px))" }}
    >
      {/* Row 1: tag + class input + delete + close */}
      <div className="flex items-center gap-1.5">
        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
          {tag.toLowerCase() || "?"}
        </span>
        <input
          type="text"
          value={classInput}
          onChange={(e) => setClassInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitInput();
            }
          }}
          placeholder="Añade clases (text-2xl bg-primary…) y Enter"
          className="bg-gray-800 text-sm text-white placeholder:text-gray-500 outline-none flex-1 min-w-0 px-2 py-1 rounded-md border border-gray-700 focus:border-blue-500"
          autoFocus
        />
        <button
          onClick={onDeleteElement}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-900/50 text-red-400 transition-colors shrink-0"
          title="Eliminar elemento"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors shrink-0"
          title="Cerrar (ESC)"
        >
          ✕
        </button>
      </div>

      {/* Row 2: chips of current classes */}
      {classes.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {classes.map((cls) => (
            <button
              key={cls}
              onClick={() => onApplyClasses({ remove: [cls] })}
              className="group px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-800 hover:bg-red-900/60 hover:text-red-200 text-gray-300 transition-colors flex items-center gap-1 max-w-[200px]"
              title={`Quitar ${cls}`}
            >
              <span className="truncate">{cls}</span>
              <span className="opacity-40 group-hover:opacity-100 text-[9px]">✕</span>
            </button>
          ))}
        </div>
      )}

      {/* Row 3: text-color swatches */}
      <div className="flex items-center gap-1 pt-0.5 flex-wrap">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0 w-10">Texto</span>
        {FIXED_SWATCHES.map(({ color, textCls, label }) => (
          <button
            key={`t-${label}`}
            onClick={() => applySwatch("text", textCls)}
            className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
            style={color === "transparent" ? {
              backgroundImage: "repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%)",
              backgroundSize: "8px 8px",
            } : { backgroundColor: color }}
            title={label}
          />
        ))}
        {themeColors && [
          { color: themeColors.primary, cls: "text-primary", label: "Primary" },
          { color: themeColors.secondary, cls: "text-secondary", label: "Secondary" },
          { color: themeColors.accent, cls: "text-accent", label: "Accent" },
          { color: themeColors.surface, cls: "text-on-surface", label: "On Surface" },
        ].map(({ color, cls, label }) => (
          <button
            key={`t-${label}`}
            onClick={() => applySwatch("text", cls)}
            className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
            style={{ backgroundColor: color }}
            title={label}
          />
        ))}
      </div>

      {/* Row 4: bg swatches (containers only) */}
      {isContainer && (
        <div className="flex items-center gap-1 pt-0.5 flex-wrap">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1 shrink-0 w-10">Fondo</span>
          {FIXED_SWATCHES.map(({ color, bgCls, label }) => (
            <button
              key={`bg-${label}`}
              onClick={() => applySwatch("bg", bgCls)}
              className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
              style={color === "transparent" ? {
                backgroundImage: "repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%)",
                backgroundSize: "8px 8px",
              } : { backgroundColor: color }}
              title={label}
            />
          ))}
          {themeColors && [
            { color: themeColors.primary, cls: "bg-primary", label: "Primary" },
            { color: themeColors.secondary, cls: "bg-secondary", label: "Secondary" },
            { color: themeColors.accent, cls: "bg-accent", label: "Accent" },
            { color: themeColors.surface, cls: "bg-surface", label: "Surface" },
          ].map(({ color, cls, label }) => (
            <button
              key={`bg-${label}`}
              onClick={() => applySwatch("bg", cls)}
              className="w-5 h-5 rounded-full border border-gray-600 hover:scale-125 transition-transform shrink-0"
              style={{ backgroundColor: color }}
              title={label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
