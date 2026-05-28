/**
 * Share editor for documents. Uses the SAME canvas + toolbar + headless orchestration as
 * everywhere else, now published in the SDK (`.../document`). This file is just the EasyBits
 * host: its own header chrome, the share-token persistence, and the PDF download. Differences
 * vs the dash editor:
 *   - No AI refine (the hook's actionBarProps omits onRefine → the row is hidden) — it'd cost
 *     the owner's credits.
 *   - No code panel (no onViewCode → button hidden).
 *   - Persistence goes through the share-token endpoint, not the owner-only one.
 */
import "@easybits.cloud/html-tailwind-generator/document.css";
import { useState, useRef, useCallback } from "react";
import {
  DocumentCanvas,
  DocumentActionBar,
  useDocumentEditor,
} from "@easybits.cloud/html-tailwind-generator/document";
import type { Section3 } from "~/lib/landing3/types";

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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Persist a section's HTML via the share-token endpoint, debounced per-id. The headless
  // hook calls this raw on every edit/undo/redo; the debounce + save-state live here.
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

  const ed = useDocumentEditor({
    initialSections,
    theme,
    customColors,
    format,
    onPersist: persistSection,
  });

  // PDF download — server-side Playwright render takes seconds, so fetch the blob (showing a
  // spinner) instead of a bare <a> navigation that gives no feedback. No toast here (the share
  // page has no Toaster shell), so loading/error state lives inside the button itself.
  const downloadPdf = useCallback(async () => {
    if (pdfState === "loading") return;
    setPdfState("loading");
    try {
      const res = await fetch(
        `/api/v2/documents/${landingId}/pdf?token=${encodeURIComponent(token)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safeName = (landingName || "documento").replace(/[^a-zA-Z0-9_\-. ]/g, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch (err) {
      console.error("[share-editor] pdf download failed", err);
      setPdfState("error");
      setTimeout(() => setPdfState("idle"), 4000);
    }
  }, [pdfState, landingId, token, landingName]);

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
          <button
            onClick={downloadPdf}
            disabled={pdfState === "loading"}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-black font-bold uppercase shrink-0 text-[10px] transition-colors disabled:cursor-wait ${pdfState === "error" ? "bg-red-50 text-red-700" : "bg-white hover:bg-brand-50"}`}
            title={pdfState === "error" ? "Error al generar PDF — reintenta" : "Descargar PDF"}
          >
            {pdfState === "loading" ? (
              <span className="w-3 h-3 border-2 border-gray-300 border-t-black rounded-full animate-spin" aria-hidden />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {pdfState === "loading" ? "Generando…" : pdfState === "error" ? "Error" : "PDF"}
          </button>
          <span className="px-2 py-0.5 rounded-full border-2 border-black bg-white font-bold uppercase shrink-0 text-[10px]">
            Edición
          </span>
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden">
        <DocumentCanvas {...ed.canvasProps} />
        <DocumentActionBar {...ed.actionBarProps} />
      </div>
    </article>
  );
}
