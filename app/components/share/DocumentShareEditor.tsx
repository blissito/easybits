/**
 * Share editor for documents. Reuses the SAME canvas + toolbar as the dash editor
 * (DocumentCanvas + DocumentActionBar) so both stay in sync — there is no longer a
 * separate share-only toolbar. Differences vs the dash editor:
 *   - No AI refine (omitting onRefine hides the row) — it'd cost the owner's credits.
 *   - No code panel (omitting onViewCode hides the button).
 *   - Persistence goes through the share-token endpoint, not the owner-only one.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  buildSingleThemeCss,
  buildCustomTheme,
  type CustomColors,
} from "@easybits.cloud/html-tailwind-generator";
import { DocumentCanvas, type DocumentCanvasHandle } from "~/components/documents/DocumentCanvas";
import { DocumentActionBar } from "~/components/documents/DocumentActionBar";
import { LANDING_THEMES } from "~/lib/landing3/themes";
import type { Section3, IframeMessage } from "~/lib/landing3/types";

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

const LETTER_PX = 816;

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
  const [sections, _setSections] = useState<Section3[]>(initialSections);
  const sectionsRef = useRef(sections);
  const setSections = useCallback((updater: Section3[] | ((prev: Section3[]) => Section3[])) => {
    _setSections((prev) => {
      const next = typeof updater === "function" ? (updater as (p: Section3[]) => Section3[])(prev) : updater;
      sectionsRef.current = next;
      return next;
    });
  }, []);
  const [selection, setSelection] = useState<IframeMessage | null>(null);
  const [iframeRect, setIframeRect] = useState<DOMRect | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [zoom, setZoom] = useState(1);
  // Parked position of the action bar — persists across selection changes, resets on close.
  const [actionBarPos, setActionBarPos] = useState<{ top: number; left: number } | null>(null);

  const canvasRef = useRef<DocumentCanvasHandle>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => { if (!selection) setActionBarPos(null); }, [selection]);

  // Theme CSS + tailwind config injected into each page iframe (same shape the dash editor
  // builds for DocumentCanvas). Custom palette → CSS variables; otherwise a named theme.
  const themeCssData = useMemo(() => {
    if (customColors) {
      const t = buildCustomTheme(customColors as unknown as CustomColors);
      const css = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(theme);
  }, [theme, customColors]);

  // Palette for the toolbar color swatches (merge brand-kit colors over a base theme so the
  // shape DocumentActionBar expects — primary/secondary/accent/surface — is complete).
  const themeColors = useMemo(() => {
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

  // Fit each page to the viewport width on mount + resize.
  useEffect(() => {
    const fit = () => {
      const w = format?.width || LETTER_PX;
      setZoom(Math.min(1, Math.max(0.1, (window.innerWidth - 48) / w)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [format]);

  // Persist a section's HTML via the share-token endpoint, debounced per-id.
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

  // Undo/redo — snapshots of the sections array, mirroring the dash canvas editor. Every
  // mutation (text, class, attr, tag, delete) funnels through 'section-html-updated', so a
  // snapshot pushed there captures all of them. Without this a guest editing the owner's real
  // document through a public link has no recovery path after a misclick — and edits auto-save.
  const undoRef = useRef<Section3[][]>([]);
  const redoRef = useRef<Section3[][]>([]);
  const pushUndo = useCallback(() => {
    undoRef.current.push(sectionsRef.current);
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  // Persist every section whose HTML differs between two snapshots (per-section endpoint).
  const persistChanged = useCallback((from: Section3[], to: Section3[]) => {
    const fromMap = new Map(from.map((s) => [s.id, s.html]));
    for (const s of to) if (fromMap.get(s.id) !== s.html) persistSection(s.id, s.html);
  }, [persistSection]);
  const doUndo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    const current = sectionsRef.current;
    redoRef.current.push(current);
    setSections(prev);
    persistChanged(current, prev);
    setSelection(null);
  }, [setSections, persistChanged]);
  const doRedo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    const current = sectionsRef.current;
    undoRef.current.push(current);
    setSections(next);
    persistChanged(current, next);
    setSelection(null);
  }, [setSections, persistChanged]);

  // Messages from the per-page DocumentCanvas iframes.
  const handleMessage = useCallback((msg: IframeMessage) => {
    if ((msg.type as string) === "escape") { setSelection(null); return; }
    if (msg.type === "element-selected") {
      // The iframe is CSS-scaled by zoom; its reported rect is unscaled. Pre-scale so the
      // toolbar (which adds iframeRect.top + rect.top) lands on the element.
      const z = zoomRef.current;
      const r = (msg as { rect?: { top: number; left: number; width: number; height: number } }).rect;
      const scaled = r
        ? { ...msg, rect: { top: r.top * z, left: r.left * z, width: r.width * z, height: r.height * z } }
        : msg;
      setSelection(scaled);
      if (msg.sectionId) setIframeRect(canvasRef.current?.getIframeRect(msg.sectionId) ?? null);
    } else if (msg.type === "element-deselected") {
      setSelection(null);
    } else if ((msg.type === "text-edited" || msg.type === "section-html-updated") && msg.sectionId) {
      const sectionHtml = (msg as { sectionHtml?: string }).sectionHtml;
      if (!sectionHtml) return;
      pushUndo();
      setSections((prev) => prev.map((s) => (s.id === msg.sectionId ? { ...s, html: sectionHtml } : s)));
      persistSection(msg.sectionId, sectionHtml);
    }
  }, [persistSection, pushUndo, setSections]);

  // Keep the action bar glued to its element as the canvas scrolls (rAF-coalesced).
  const lastScrollTop = useRef(0);
  const scrollRaf = useRef<number | null>(null);
  const pendingScrollTop = useRef(0);
  const handleScroll = useCallback((scrollTop: number) => {
    pendingScrollTop.current = scrollTop;
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const delta = pendingScrollTop.current - lastScrollTop.current;
      lastScrollTop.current = pendingScrollTop.current;
      if (!delta) return;
      const sid = selectionRef.current?.sectionId;
      if (!sid) return;
      setIframeRect(canvasRef.current?.getIframeRect(sid) ?? null);
      setActionBarPos((p) => (p ? { ...p, top: p.top - delta } : p));
    });
  }, []);

  // Edit ops — post to the selected page's iframe (same protocol as the dash editor).
  const applyClasses = useCallback((nextClasses: string[]) => {
    if (!selection?.sectionId || !selection?.elementPath) return;
    const value = nextClasses.join(" ");
    canvasRef.current?.postToSection(selection.sectionId, {
      action: "update-attribute",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
      tagName: selection.tagName || "*",
      attr: "class",
      value,
    });
    setSelection((prev) => (prev ? { ...prev, className: value } : prev));
  }, [selection]);

  const changeTag = useCallback((newTag: string) => {
    if (!selection?.sectionId || !selection?.elementPath) return;
    canvasRef.current?.postToSection(selection.sectionId, {
      action: "change-tag",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
      newTag,
    });
  }, [selection]);

  const updateAttribute = useCallback((attr: string, value: string) => {
    if (!selection?.sectionId || !selection?.elementPath) return;
    canvasRef.current?.postToSection(selection.sectionId, {
      action: "update-attribute",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
      tagName: selection.tagName || "*",
      attr,
      value,
    });
  }, [selection]);

  const deleteElement = useCallback(() => {
    if (!selection?.sectionId || !selection?.elementPath) return;
    canvasRef.current?.postToSection(selection.sectionId, {
      action: "delete-element",
      sectionId: selection.sectionId,
      elementPath: selection.elementPath,
    });
    setSelection(null);
  }, [selection]);

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
        <DocumentCanvas
          handleRef={canvasRef}
          sections={sections}
          themeCss={themeCssData?.css || ""}
          tailwindConfig={themeCssData?.tailwindConfig || "{}"}
          format={format ?? undefined}
          zoom={zoom}
          onZoomChange={setZoom}
          onUndo={doUndo}
          onRedo={doRedo}
          onMessage={handleMessage}
          onScroll={handleScroll}
        />

        <DocumentActionBar
          selection={selection}
          iframeRect={iframeRect}
          themeColors={themeColors as Record<string, string>}
          onApplyClasses={applyClasses}
          onChangeTag={changeTag}
          onUpdateAttribute={updateAttribute}
          onDeleteElement={deleteElement}
          onClose={() => setSelection(null)}
          pos={actionBarPos}
          onPosChange={setActionBarPos}
        />
      </div>
    </article>
  );
}
