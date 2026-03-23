import { useState, useRef, useCallback, useEffect } from "react";
import type { Section3 } from "../types";

/** Build HTML for the off-screen capture iframe */
function buildCaptureHtml(sectionHtml: string, themeCssData?: { css: string; tailwindConfig: string }): string {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"><\/script>
${themeCssData ? `<script>tailwind.config = ${themeCssData.tailwindConfig}<\/script>` : ""}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; width: 8.5in; height: 11in; overflow: hidden; }
${themeCssData?.css || ""}
</style>
</head><body>${sectionHtml}</body></html>`;
}

const THUMB_W = 200;
const THUMB_H = Math.round(THUMB_W * (11 / 8.5));

/**
 * Captures static thumbnail images from sections using a single off-screen iframe.
 * Processes one section at a time via a queue to avoid N simultaneous Tailwind CDN loads.
 */
export function useThumbnailCapture(
  sections: Section3[],
  themeCssData?: { css: string; tailwindConfig: string }
) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const queueRef = useRef<{ id: string; html: string }[]>([]);
  const busyRef = useRef(false);
  const lastHtmlRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const processQueue = useCallback(() => {
    if (busyRef.current || queueRef.current.length === 0) return;
    busyRef.current = true;

    const item = queueRef.current.shift()!;

    // Create iframe on demand
    if (!iframeRef.current) {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;opacity:0;pointer-events:none;border:none;";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const iframe = iframeRef.current;
    const html = buildCaptureHtml(item.html, themeCssData);

    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      // Wait for Tailwind CDN to process + images to load
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument;
          if (!doc?.body) throw new Error("no doc");
          const canvas = document.createElement("canvas");
          canvas.width = THUMB_W * 2; // 2x for retina
          canvas.height = THUMB_H * 2;
          const ctx = canvas.getContext("2d")!;
          ctx.scale(2, 2);

          // Use svg foreignObject to render HTML to canvas
          const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_W}" height="${THUMB_H}">
            <foreignObject width="816" height="1056" transform="scale(${THUMB_W / 816})">
              ${new XMLSerializer().serializeToString(doc.documentElement)}
            </foreignObject>
          </svg>`;
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, THUMB_W, THUMB_H);
            const dataUrl = canvas.toDataURL("image/png");
            setThumbs((prev) => ({ ...prev, [item.id]: dataUrl }));
            busyRef.current = false;
            processQueue();
          };
          img.onerror = () => {
            busyRef.current = false;
            processQueue();
          };
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
        } catch {
          busyRef.current = false;
          processQueue();
        }
      }, 800);
    };

    iframe.addEventListener("load", onLoad);
    iframe.srcdoc = html;
  }, [themeCssData]);

  // Queue sections that changed
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const content = sections.filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__");
      let changed = false;
      for (const s of content) {
        if (lastHtmlRef.current[s.id] !== s.html) {
          lastHtmlRef.current[s.id] = s.html;
          queueRef.current = queueRef.current.filter((q) => q.id !== s.id);
          queueRef.current.push({ id: s.id, html: s.html });
          changed = true;
        }
      }
      // Clean up removed sections
      const ids = new Set(content.map((s) => s.id));
      for (const id of Object.keys(lastHtmlRef.current)) {
        if (!ids.has(id)) delete lastHtmlRef.current[id];
      }
      if (changed) processQueue();
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [sections, processQueue]);

  // Re-capture all when theme changes
  const prevThemeRef = useRef(themeCssData);
  useEffect(() => {
    if (prevThemeRef.current === themeCssData) return;
    prevThemeRef.current = themeCssData;
    lastHtmlRef.current = {};
    setThumbs({});
  }, [themeCssData]);

  // Cleanup iframe on unmount
  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.remove();
        iframeRef.current = null;
      }
    };
  }, []);

  return thumbs;
}
