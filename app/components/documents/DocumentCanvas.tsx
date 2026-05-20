/**
 * Neutral per-page canvas (early-adopter easter egg behind ?canvas=1).
 *
 * Renders each page in its OWN iframe whose viewport equals the document format, so
 * `100vw/100vh` and the design's own `<body>` background resolve natively — versatile
 * for ANY size the agent requests (slide, social, letter, custom) without forcing a
 * theme background. Reuses the SDK interaction script (getIframeScript) so selection,
 * inline text edit and class/attribute edits work exactly like the share editor, lifted
 * to a parent FloatingToolbar.
 *
 * Contrast with the landings3 Canvas (one shared iframe + `<body class="bg-surface">`),
 * which imposes a theme background and a single viewport — wrong model for imported
 * full-bleed designs.
 */
import { useRef, useEffect, useImperativeHandle, useCallback, type Ref } from "react";
import { getIframeScript } from "@easybits.cloud/html-tailwind-generator";
import type { Section3, IframeMessage } from "~/lib/landing3/types";

export interface DocumentCanvasHandle {
  scrollToSection: (id: string) => void;
  postToSection: (id: string, msg: Record<string, unknown>) => void;
  /** Bounding rect (viewport coords) of a section's iframe — for toolbar positioning. */
  getIframeRect: (id: string) => DOMRect | null;
}

interface Props {
  sections: Section3[];
  themeCss: string;
  tailwindConfig: string;
  format?: { width: number; height: number };
  /** Scale factor applied to each page (1 = 100%). */
  zoom: number;
  /** Zoom intent from Cmd/Ctrl+scroll or Cmd/Ctrl + / - / 0 (clamped 0.1–2). */
  onZoomChange?: (zoom: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMessage: (msg: IframeMessage) => void;
  /** Fires on container scroll (passes scrollTop) so the parent can re-anchor the action bar. */
  onScroll?: (scrollTop: number) => void;
  /** Escape pressed (in the canvas or inside a page iframe) — used to close the action bar. */
  onEscape?: () => void;
  handleRef?: Ref<DocumentCanvasHandle>;
}

function buildSrcDoc(
  section: Section3,
  themeCss: string,
  tailwindConfig: string,
  w: number,
  h: number
): string {
  // Neutral document: size to format, NO bg-surface body class. The page paints its
  // own background (section bg-* class for generated docs, embedded <style>body{} for
  // imported designs). Format-sized viewport makes 100vw/100vh resolve to the page.
  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"/>
<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config = ${tailwindConfig}<\/script>
<script src="https://unpkg.com/morphdom@2.7.4/dist/morphdom-umd.min.js"><\/script>
<style>
${themeCss}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
[data-section-id] { width: ${w}px; height: ${h}px; overflow: hidden; }
[contenteditable="true"] { cursor: text; }
</style>
</head><body>
<div data-section-id="${section.id}">${section.html}</div>
<script>${getIframeScript()}<\/script>
<script>
// Forward Escape to the parent (the action bar lives there). Must run INSIDE the iframe
// because it captures keyboard focus — a parent-side listener never sees the keypress
// (same reason the SDK forwards undo/redo via postMessage).
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  window.parent.postMessage({ type: 'escape' }, '*');
});
<\/script>
</body></html>`;
}

export function DocumentCanvas({
  sections,
  themeCss,
  tailwindConfig,
  format,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  onMessage,
  onScroll,
  onEscape,
  handleRef,
}: Props) {
  const w = format?.width || 816;
  const h = format?.height || 1056;
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const clampZoom = (z: number) => Math.min(2, Math.max(0.1, z));

  // Escape closes the action bar. Page iframes capture keyboard focus, so this must be
  // attached to each iframe's OWN document (same channel the SDK script uses to forward
  // undo/redo) — a parent/window listener never sees the keypress. Skip while typing.
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    onEscapeRef.current?.();
  }, []);

  // Cmd/Ctrl + wheel → zoom (also covers trackpad pinch, which fires wheel+ctrlKey).
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    onZoomChangeRef.current?.(clampZoom(zoomRef.current * (1 - e.deltaY * 0.0015)));
  }, []);
  // Cmd/Ctrl + / - / 0 → zoom; Cmd/Ctrl + Z / Shift+Z → undo / redo.
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); onZoomChangeRef.current?.(clampZoom(zoomRef.current * 1.1)); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); onZoomChangeRef.current?.(clampZoom(zoomRef.current / 1.1)); return; }
    if (e.key === "0") { e.preventDefault(); onZoomChangeRef.current?.(1); return; }
    // Skip undo while editing text so the browser's native field/contenteditable undo works.
    if (e.key.toLowerCase() === "z") {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) onRedoRef.current?.(); else onUndoRef.current?.();
    }
  }, []);

  // Attach to the scroll container + document. Wheel must be non-passive to preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    const onScrollEvt = () => { if (el) onScrollRef.current?.(el.scrollTop); };
    el?.addEventListener("wheel", handleWheel, { passive: false });
    el?.addEventListener("scroll", onScrollEvt, { passive: true });
    document.addEventListener("keydown", handleKey);
    document.addEventListener("keydown", handleEscape);
    return () => {
      el?.removeEventListener("wheel", handleWheel);
      el?.removeEventListener("scroll", onScrollEvt);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleWheel, handleKey, handleEscape]);

  // Same-origin srcdoc iframes capture their own events, so attach the handlers to each
  // iframe's window/document on load (forwarding via postMessage isn't needed for same-origin).
  const attachIframeZoom = useCallback((win: Window | null) => {
    if (!win) return;
    win.addEventListener("wheel", handleWheel, { passive: false });
    win.addEventListener("keydown", handleKey);
    // (Escape from inside the iframe is forwarded via postMessage by buildSrcDoc, since a
    // parent-attached listener can't reliably catch keys while the iframe holds focus.)
  }, [handleWheel, handleKey]);

  const content = sections
    .filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__")
    .sort((a, b) => a.order - b.order);

  useImperativeHandle(handleRef, () => ({
    scrollToSection: (id: string) => {
      wrapRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    postToSection: (id: string, msg: Record<string, unknown>) => {
      iframeRefs.current.get(id)?.contentWindow?.postMessage(msg, "*");
    },
    getIframeRect: (id: string) => iframeRefs.current.get(id)?.getBoundingClientRect() ?? null,
  }), []);

  // Single message listener; map event.source → which section's iframe it came from.
  useEffect(() => {
    function onWindowMessage(e: MessageEvent) {
      const msg = e.data as IframeMessage & { sectionId?: string };
      if (!msg || typeof msg.type !== "string") return;
      // Only handle messages from one of our iframes.
      let fromOurs = false;
      for (const ifr of iframeRefs.current.values()) {
        if (ifr.contentWindow === e.source) { fromOurs = true; break; }
      }
      if (!fromOurs) return;
      onMessageRef.current(msg);
    }
    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, []);

  const setIframeRef = useCallback((id: string) => (el: HTMLIFrameElement | null) => {
    if (el) iframeRefs.current.set(id, el);
    else iframeRefs.current.delete(id);
  }, []);
  const setWrapRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) wrapRefs.current.set(id, el);
    else wrapRefs.current.delete(id);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-[#374151] flex flex-col items-center gap-6 py-6">
      {content.map((section, idx) => (
        <div
          key={section.id}
          ref={setWrapRef(section.id)}
          className="shrink-0 rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.15)] overflow-hidden bg-white"
          style={{ width: w * zoom, height: h * zoom }}
          data-page-index={idx}
        >
          <iframe
            ref={setIframeRef(section.id)}
            title={section.label || `Página ${idx + 1}`}
            width={w}
            height={h}
            srcDoc={buildSrcDoc(section, themeCss, tailwindConfig, w, h)}
            onLoad={(e) => attachIframeZoom(e.currentTarget.contentWindow)}
            style={{
              width: w,
              height: h,
              border: 0,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              display: "block",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default DocumentCanvas;
