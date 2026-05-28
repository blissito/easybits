/**
 * Headless orchestration for the document canvas editor.
 *
 * Owns the editor STATE and edit operations (selection, class/tag/attribute edits,
 * inline-text edits, delete, undo/redo, zoom-to-fit, theme CSS) but NO persistence and
 * NO chrome. The host supplies `onPersist(sectionId, html)` — called raw on every change
 * (debounce/fetch/save-state are the host's concern) — and renders its own header.
 *
 * Spread `canvasProps` onto <DocumentCanvas> and `actionBarProps` onto <DocumentActionBar>.
 * A richer host (e.g. one with AI refine / a code panel) can use the granular fields
 * (sections, selection, canvasRef, the individual handlers) directly instead.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  buildSingleThemeCss,
  buildCustomTheme,
  LANDING_THEMES,
  type CustomColors,
} from "../themes";
import type { Section3, IframeMessage } from "../types";
import type { DocumentCanvasHandle } from "./DocumentCanvas";

const LETTER_PX = 816;

export interface UseDocumentEditorOptions {
  initialSections: Section3[];
  /** Named theme id (see LANDING_THEMES). Ignored when `customColors` is provided. */
  theme: string;
  /** Custom palette (primary/secondary/accent/surface…) → CSS variables. */
  customColors?: Record<string, string> | null;
  /** Page size in px. Defaults to US-Letter at 96dpi (816×1056). */
  format?: { width: number; height: number } | null;
  /**
   * Called whenever a section's HTML changes (edit, undo, or redo), once per changed
   * section. The host owns the persistence policy (debounce, fetch, save-state).
   */
  onPersist?: (sectionId: string, html: string) => void;
}

export function useDocumentEditor({
  initialSections,
  theme,
  customColors,
  format,
  onPersist,
}: UseDocumentEditorOptions) {
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
  const [zoom, setZoom] = useState(1);
  // Parked position of the action bar — persists across selection changes, resets on close.
  const [actionBarPos, setActionBarPos] = useState<{ top: number; left: number } | null>(null);

  const canvasRef = useRef<DocumentCanvasHandle>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  useEffect(() => { if (!selection) setActionBarPos(null); }, [selection]);

  // Theme CSS + tailwind config injected into each page iframe. Custom palette → CSS
  // variables; otherwise a named theme.
  const themeCssData = useMemo(() => {
    if (customColors) {
      const t = buildCustomTheme(customColors as unknown as CustomColors);
      const css = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
      const { tailwindConfig } = buildSingleThemeCss("minimal");
      return { css, tailwindConfig };
    }
    return buildSingleThemeCss(theme);
  }, [theme, customColors]);

  // Palette for the toolbar color swatches (merge custom colors over a base theme so the
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

  // Undo/redo — snapshots of the sections array. Every mutation (text, class, attr, tag,
  // delete) funnels through 'section-html-updated', so a snapshot pushed there captures
  // all of them.
  const undoRef = useRef<Section3[][]>([]);
  const redoRef = useRef<Section3[][]>([]);
  const pushUndo = useCallback(() => {
    undoRef.current.push(sectionsRef.current);
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  // Persist every section whose HTML differs between two snapshots.
  const persistChanged = useCallback((from: Section3[], to: Section3[]) => {
    const fromMap = new Map(from.map((s) => [s.id, s.html]));
    for (const s of to) if (fromMap.get(s.id) !== s.html) onPersistRef.current?.(s.id, s.html);
  }, []);
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
      onPersistRef.current?.(msg.sectionId, sectionHtml);
    }
  }, [pushUndo, setSections]);

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

  // Edit ops — post to the selected page's iframe (same protocol as the canvas script).
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

  const closeSelection = useCallback(() => setSelection(null), []);

  return {
    // state
    sections,
    setSections,
    selection,
    setSelection,
    iframeRect,
    zoom,
    setZoom,
    actionBarPos,
    setActionBarPos,
    canvasRef,
    themeCss: themeCssData?.css || "",
    tailwindConfig: themeCssData?.tailwindConfig || "{}",
    themeColors: themeColors as Record<string, string>,
    // operations
    handleMessage,
    handleScroll,
    doUndo,
    doRedo,
    applyClasses,
    changeTag,
    updateAttribute,
    deleteElement,
    closeSelection,
    // ready-to-spread props
    canvasProps: {
      handleRef: canvasRef,
      sections,
      themeCss: themeCssData?.css || "",
      tailwindConfig: themeCssData?.tailwindConfig || "{}",
      format: format ?? undefined,
      zoom,
      onZoomChange: setZoom,
      onUndo: doUndo,
      onRedo: doRedo,
      onMessage: handleMessage,
      onScroll: handleScroll,
    },
    actionBarProps: {
      selection,
      iframeRect,
      themeColors: themeColors as Record<string, string>,
      onApplyClasses: applyClasses,
      onChangeTag: changeTag,
      onUpdateAttribute: updateAttribute,
      onDeleteElement: deleteElement,
      onClose: closeSelection,
      pos: actionBarPos,
      onPosChange: setActionBarPos,
    },
  };
}
