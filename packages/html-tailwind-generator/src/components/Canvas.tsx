import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import type { Section3, IframeMessage } from "../types";
import { buildPreviewHtml } from "../buildHtml";

export interface CanvasHandle {
  scrollToSection: (id: string) => void;
  postMessage: (msg: Record<string, unknown>) => void;
}

interface CanvasProps {
  sections: Section3[];
  theme?: string;
  onMessage: (msg: IframeMessage) => void;
  iframeRectRef: React.MutableRefObject<DOMRect | null>;
  onReady?: () => void;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas({ sections, theme, onMessage, iframeRectRef, onReady: onReadyProp }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // Track what the iframe currently has so we can diff
  const knownSectionsRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const onReadyRef = useRef(onReadyProp);
  onReadyRef.current = onReadyProp;

  // Post a message to the iframe
  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToSection(id: string) {
      postToIframe({ action: "scroll-to-section", id });
    },
    postMessage(msg: Record<string, unknown>) {
      postToIframe(msg);
    },
  }), [postToIframe]);

  // Initial write: set up the iframe shell (empty body + script + tailwind)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || initializedRef.current) return;
    initializedRef.current = true;

    const html = buildPreviewHtml([]);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, []);

  // Handle "ready" from iframe — then inject current sections
  const handleReady = useCallback(() => {
    setReady(true);
    // Inject all current sections
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    for (const s of sorted) {
      postToIframe({ action: "add-section", id: s.id, html: s.html, scroll: false });
      knownSectionsRef.current.set(s.id, s.html);
    }
    // Restore scroll position from sessionStorage
    const savedY = sessionStorage.getItem("landing-v3-iframe-scrollY");
    if (savedY) {
      setTimeout(() => postToIframe({ action: "restore-scroll", y: Number(savedY) }), 100);
    }
    onReadyRef.current?.();
  }, [sections, postToIframe]);

  // Incremental diff: detect added/updated/removed/renamed sections
  useEffect(() => {
    if (!ready) return;

    const known = knownSectionsRef.current;
    const currentIds = new Set(sections.map((s) => s.id));
    const sorted = [...sections].sort((a, b) => a.order - b.order);

    // Detect renames: a known id disappears and a new id appears at the same index
    const removedIds = [...known.keys()].filter((id) => !currentIds.has(id));
    const addedSections = sorted.filter((s) => !known.has(s.id));

    // Match removed → added by position for rename (e.g. __building__ → real id)
    const renamedSet = new Set<string>();
    for (const removedId of removedIds) {
      if (addedSections.length > 0) {
        const added = addedSections.shift()!;
        postToIframe({ action: "rename-section", oldId: removedId, newId: added.id, html: added.html });
        known.delete(removedId);
        known.set(added.id, added.html);
        renamedSet.add(added.id);
      }
    }

    // Add truly new sections (not renamed)
    for (const s of sorted) {
      if (renamedSet.has(s.id)) continue;
      if (!known.has(s.id)) {
        postToIframe({ action: "add-section", id: s.id, html: s.html, scroll: s.id !== "__building__" });
        known.set(s.id, s.html);
      } else if (known.get(s.id) !== s.html) {
        // Update changed sections
        postToIframe({ action: "update-section", id: s.id, html: s.html });
        known.set(s.id, s.html);
      }
    }

    // Remove deleted sections (that weren't renamed)
    for (const id of [...known.keys()]) {
      if (!currentIds.has(id)) {
        postToIframe({ action: "remove-section", id });
        known.delete(id);
      }
    }

    // Reorder if needed
    const knownOrder = [...known.keys()];
    const desiredOrder = sorted.map((s) => s.id);
    if (knownOrder.length !== desiredOrder.length || knownOrder.some((id, i) => id !== desiredOrder[i])) {
      postToIframe({ action: "reorder-sections", order: desiredOrder });
      // Rebuild Map in new order so subsequent diffs compare correctly
      const reordered = new Map<string, string>();
      for (const id of desiredOrder) {
        const html = known.get(id);
        if (html !== undefined) reordered.set(id, html);
      }
      knownSectionsRef.current = reordered;
    }
  }, [sections, ready, postToIframe]);

  // Send theme changes to iframe
  useEffect(() => {
    if (!ready) return;
    postToIframe({ action: "set-theme", theme: theme || "default" });
  }, [theme, ready, postToIframe]);

  // Update iframe rect on resize/scroll
  const updateRect = useCallback(() => {
    if (iframeRef.current) {
      iframeRectRef.current = iframeRef.current.getBoundingClientRect();
    }
  }, [iframeRectRef]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  // Periodically save iframe scroll position
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      postToIframe({ action: "get-scroll" });
    }, 2000);
    return () => clearInterval(interval);
  }, [ready, postToIframe]);

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data.type !== "string") return;

      if (data.type === "ready") {
        handleReady();
        return;
      }

      if (data.type === "scroll-position") {
        sessionStorage.setItem("landing-v3-iframe-scrollY", String(data.y));
        return;
      }

      if (
        ["element-selected", "element-contextmenu", "text-edited", "element-deselected", "section-html-updated", "undo", "redo"].includes(
          data.type
        )
      ) {
        // Sync known HTML so the diff doesn't re-send to iframe
        if (data.type === "section-html-updated" && data.sectionId && data.sectionHtml) {
          knownSectionsRef.current.set(data.sectionId, data.sectionHtml);
        }
        updateRect();
        onMessage(data as IframeMessage);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage, updateRect, handleReady]);

  return (
    <div className="flex-1 overflow-hidden relative">
      <iframe
        ref={iframeRef}
        title="Landing preview"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
        style={{ minHeight: "calc(100vh - 120px)" }}
      />
      {!ready && sections.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <span className="w-6 h-6 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
        </div>
      )}
      <a href="https://www.easybits.cloud" target="_blank" rel="noopener noreferrer"
         className="absolute bottom-2 right-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        Powered by easybits.cloud
      </a>
    </div>
  );
});
