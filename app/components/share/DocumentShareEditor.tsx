/**
 * Lightweight share editor for documents. Reuses the landings3 Canvas + FloatingToolbar
 * stack but renders multipage with format-aware page sizing and persists changes via the
 * share-token endpoint instead of the dash editor's owner-only one.
 *
 * What's deliberately disabled vs the dash editor:
 *   - AI refine / variants — costs the owner's credits; not exposed in v1.
 *   - Section move/delete — share invitee shouldn't reorder doc structure.
 *   - View code panel — not needed for content edits.
 *
 * What's enabled:
 *   - Inline text editing (contenteditable in the iframe).
 *   - FloatingToolbar tag swap, color swatches, size presets, delete element, attribute edits.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Canvas, type CanvasHandle } from "~/components/landings3/Canvas";
import ShareInspector from "~/components/share/ShareInspector";
import type { Section3, IframeMessage } from "~/lib/landing3/types";
import { LANDING_THEMES, buildCustomThemeCss, type CustomColors } from "~/lib/landing3/themes";

interface Props {
  landingId: string;
  landingName: string;
  sections: Section3[];
  theme: string;
  customColors: Record<string, string> | null;
  format: { width: number; height: number } | null;
  ownerEmail: string;
  token: string;
  expiresAt: string;
}

type SaveState = "idle" | "saving" | "error";

export default function DocumentShareEditor({
  landingId,
  landingName,
  sections: initialSections,
  theme,
  customColors,
  format,
  ownerEmail,
  token,
}: Props) {
  const [sections, setSections] = useState<Section3[]>(initialSections);
  const [selection, setSelection] = useState<IframeMessage | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [canvasReady, setCanvasReady] = useState(false);
  const [iframeRect, setIframeRect] = useState<DOMRect | null>(null);
  const iframeRectRef = useRef<DOMRect | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // Resolve theme colors for FloatingToolbar swatches. Merge the doc's brand-kit colors
  // (primary/secondary/accent/surface from metadata.customColors) with a base theme so the
  // shape FloatingToolbar expects (with surface-alt, on-surface, etc.) is complete.
  const resolvedThemeColors = useMemo(() => {
    const base = LANDING_THEMES.find((t) => t.id === theme) ?? LANDING_THEMES[0];
    if (!customColors) return base.colors;
    return {
      ...base.colors,
      primary: customColors.primary || base.colors.primary,
      secondary: customColors.secondary || base.colors.secondary,
      accent: customColors.accent || base.colors.accent,
      surface: customColors.surface || base.colors.surface,
    };
  }, [theme, customColors]);

  // Inject document-aware page CSS into the iframe. CSS `zoom` needs a literal unitless
  // number — `calc()` can't divide by px to get one, so we compute it in JS from the parent
  // viewport width and re-push on resize.
  useEffect(() => {
    if (!canvasReady) return;
    const w = format?.width;
    const h = format?.height;

    // Brand-kit CSS variables (--color-primary, etc.) so utilities like bg-primary,
    // text-accent, etc. resolve to the doc's actual colors when applied via swatches.
    const brandCss = customColors ? buildCustomThemeCss(customColors as unknown as CustomColors) : "";

    function buildAndPushCss() {
      let pageCss: string;
      const viewportW = window.innerWidth;
      const padding = 32;
      if (w && h) {
        const zoom = Math.min(1, Math.max(0.1, (viewportW - padding) / w));
        pageCss = `body { background: #e5e7eb !important; display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; min-height: 100vh; margin: 0; }
[data-section-id] { width: ${w}px; height: ${h}px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); overflow: hidden; zoom: ${zoom.toFixed(3)}; border-radius: 4px; }
[data-section-id] > section { width: 100% !important; height: 100% !important; }`;
      } else {
        // Letter default: 8.5in ≈ 816px @ 96dpi. En desktop deja la página
        // a tamaño real; en mobile aplica zoom para que la hoja completa
        // entre en el viewport sin scroll horizontal.
        const LETTER_PX = 816;
        const zoom = Math.min(1, Math.max(0.1, (viewportW - padding) / LETTER_PX));
        pageCss = `body { background: #e5e7eb !important; display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; min-height: 100vh; margin: 0; }
[data-section-id] { width: 8.5in; height: 11in; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); overflow: hidden; zoom: ${zoom.toFixed(3)}; border-radius: 4px; }
[data-section-id] > section { width: 100% !important; height: 100% !important; }`;
      }
      // set-custom-css replaces the entire style tag content, so combine brand + page CSS.
      canvasRef.current?.postMessage({ action: "set-custom-css", css: brandCss + "\n" + pageCss });
    }

    buildAndPushCss();
    const onResize = () => buildAndPushCss();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [format, canvasReady, customColors]);

  // Persist section changes per-id with debounce so rapid typing doesn't hammer the server.
  const persistSection = useCallback((sectionId: string, html: string) => {
    const existing = saveTimers.current.get(sectionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      saveTimers.current.delete(sectionId);
      setSaveState("saving");
      try {
        const res = await fetch(`/api/v2/share/documents/${token}/section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sectionId, html }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveState("idle");
      } catch (err) {
        console.error("[share-editor] persist failed", err);
        setSaveState("error");
      }
    }, 600);
    saveTimers.current.set(sectionId, timer);
  }, [token]);

  const handleIframeMessage = useCallback((msg: IframeMessage) => {
    console.log("[share/parent] msg", msg.type, {
      sectionId: (msg as { sectionId?: string }).sectionId,
      className: (msg as { className?: string }).className,
    });
    // Refresh iframeRect on every message so the overlay positions against an up-to-date rect
    // even after scroll/resize between selections.
    if (iframeRectRef.current) setIframeRect(iframeRectRef.current);
    if (msg.type === "element-selected") {
      setSelection(msg);
    } else if (msg.type === "element-deselected") {
      setSelection(null);
    } else if (msg.type === "text-edited" && msg.sectionId) {
      const sectionHtml = (msg as { sectionHtml?: string }).sectionHtml;
      if (sectionHtml) {
        setSections((prev) => prev.map((s) => (s.id === msg.sectionId ? { ...s, html: sectionHtml } : s)));
        persistSection(msg.sectionId, sectionHtml);
      }
    } else if (msg.type === "section-html-updated" && msg.sectionId && msg.sectionHtml) {
      setSections((prev) => prev.map((s) => (s.id === msg.sectionId ? { ...s, html: msg.sectionHtml! } : s)));
      persistSection(msg.sectionId, msg.sectionHtml);
    }
  }, [persistSection]);

  // Single-flow mutation: compute the next class string locally and write it via update-attribute.
  // The iframe handler emits 'section-html-updated' which gets persisted by handleIframeMessage.
  function applyClasses({ add = [], remove = [] }: { add?: string[]; remove?: string[] }) {
    if (!selection?.sectionId || !selection?.elementPath) return;
    const current = (selection.className || "").split(/\s+/).filter(Boolean);
    const next = current.filter((c) => !remove.includes(c));
    for (const c of add) if (!next.includes(c)) next.push(c);
    console.log("[share/parent] applyClasses", { add, remove, current, next });
    canvasRef.current?.postMessage({
      action: "update-attribute",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
      tagName: selection.tagName || "*",
      attr: "class",
      value: next.join(" "),
    });
    // Optimistic update of selection so the chip list re-renders immediately.
    setSelection({ ...selection, className: next.join(" ") });
  }

  // Generic attribute update — used to surgically clean inline style props that conflict
  // with utility classes (e.g. `style="color:#hex"` when applying a text-* swatch).
  function updateSelectedAttribute(attr: string, value: string) {
    if (!selection?.sectionId || !selection?.elementPath) return;
    canvasRef.current?.postMessage({
      action: "update-attribute",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
      tagName: selection.tagName || "*",
      attr,
      value,
    });
    if (attr === "style") {
      const updatedAttrs = { ...(selection.attrs || {}), style: value };
      setSelection({ ...selection, attrs: updatedAttrs });
    }
  }

  function deleteSelectedElement() {
    if (!selection?.sectionId || !selection?.elementPath) return;
    canvasRef.current?.postMessage({
      action: "delete-element",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
    });
    setSelection(null);
  }

  const saveLabel =
    saveState === "saving" ? "Guardando…" :
    saveState === "error" ? "Error al guardar" :
    "Guardado";

  return (
    <article className="flex flex-col h-screen w-full bg-gray-100">
      <header className="flex items-center justify-between gap-3 px-4 py-2 bg-brand-50 border-b-2 border-black text-xs sm:text-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black uppercase tracking-wide">EasyBits</span>
          <span className="text-gray-600 truncate">
            Editando <span className="font-semibold">{landingName}</span> · Compartido por <span className="font-semibold">{ownerEmail}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs ${saveState === "error" ? "text-red-600 font-bold" : "text-gray-500"}`}>
            {saveLabel}
          </span>
          <a
            href={`/api/v2/documents/${landingId}/pdf?token=${encodeURIComponent(token)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-black bg-white hover:bg-brand-50 font-bold uppercase shrink-0 text-[10px] transition-colors"
            title="Descargar PDF"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PDF
          </a>
          <span className="px-2 py-0.5 rounded-full border-2 border-black bg-white font-bold uppercase shrink-0 text-[10px]">
            Edición
          </span>
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden">
        <Canvas
          ref={canvasRef}
          sections={sections}
          theme={theme}
          onMessage={handleIframeMessage}
          iframeRectRef={iframeRectRef}
          onReady={() => setCanvasReady(true)}
        />

        <ShareInspector
          selection={selection}
          iframeRect={iframeRect}
          themeColors={resolvedThemeColors}
          onApplyClasses={applyClasses}
          onUpdateAttribute={updateSelectedAttribute}
          onDeleteElement={deleteSelectedElement}
          onClose={() => setSelection(null)}
        />
      </div>
    </article>
  );
}
