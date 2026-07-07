import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema } from "@blocknote/core";
import { en as blockNoteEn } from "@blocknote/core/locales";
import { withMultiColumn, multiColumnDropCursor, locales as multiColumnLocales } from "@blocknote/xl-multi-column";
import type { Section3 } from "~/lib/landing3/types";

// Editor de documento SIMPLE — BlockNote SIN colaboración (sin Yjs, sin caja
// Hocuspocus) → carga instantánea. Es lo que abre el ARTEFACTO en Teams para que
// el owner vea/edite lo recién creado sin esperar el spawn de la caja collab. La
// co-edición (caja) queda para el botón de COMPARTIR (a un externo). Carga LAZY.
//
// Persiste el HTML a Landing.sections vía el endpoint por-sección del share.
// Mismos botones de export PDF/Word que el editor collab.

// `data-doc-flow` marca la sección como PROSA que fluye (no una página diseñada de
// altura fija). El pipeline de PDF lo usa para paginar en flujo natural (como Word)
// en vez de recortar a una caja de 11in. Fuente única del marcador.
function wrapAsPage(innerHtml: string): string {
  return `<section data-doc-flow="1" class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`;
}

export default function SimpleDocEditor({
  landingId,
  sections,
  token,
}: {
  landingId: string;
  sections: Section3[];
  token: string;
}) {
  const persistSectionId = sections[0]?.id ?? "page-1";
  const initialHtml = sections.map((s) => s.html).join("\n") || "<p></p>";
  const seeded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);
  const [shared, setShared] = useState(false);

  // Columnas (mínimo de Word): arrastrar un bloque al costado de otro crea 2+ columnas
  // (firmas Empleador/Trabajador lado a lado). `withMultiColumn` extiende el schema y
  // `multiColumnDropCursor` habilita el drop lateral (no solo arriba/abajo).
  const editor = useCreateBlockNote({
    schema: withMultiColumn(BlockNoteSchema.create()),
    dropCursor: multiColumnDropCursor,
    dictionary: { ...blockNoteEn, multi_column: multiColumnLocales.en },
  });

  // Compartir = co-edición. Levanta la caja collab SOLO ahora (no en el visor). El
  // link /collab/document/:token abre el editor en vivo con cursores para el externo.
  const share = useCallback(async () => {
    const url = `${window.location.origin}/collab/document/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }, [token]);

  // Siembra el contenido desde las sections una sola vez (no es colaborativo, así
  // que no hay carrera: cada quien carga su copia y persiste al owner).
  useEffect(() => {
    if (!editor || seeded.current) return;
    seeded.current = true;
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(initialHtml);
      if (blocks.length) editor.replaceBlocks(editor.document, blocks);
    })();
  }, [editor, initialHtml]);

  const persist = useCallback(
    (innerHtml: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/v2/share/documents/${encodeURIComponent(token)}/section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sectionId: persistSectionId, html: wrapAsPage(innerHtml) }),
        }).catch((e) => console.error("[doc] persist failed", e));
      }, 800);
    },
    [token, persistSectionId],
  );

  useEffect(() => {
    if (!editor) return;
    return editor.onChange(async () => {
      // No persistir la siembra inicial (se dispara onChange en replaceBlocks).
      if (!seeded.current) return;
      const html = await editor.blocksToFullHTML(editor.document);
      persist(html);
    });
  }, [editor, persist]);

  const exportDoc = useCallback(
    async (fmt: "pdf" | "docx") => {
      if (!editor || exporting) return;
      setExporting(fmt);
      try {
        const html = await editor.blocksToFullHTML(editor.document);
        await fetch(`/api/v2/share/documents/${encodeURIComponent(token)}/section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sectionId: persistSectionId, html: wrapAsPage(html) }),
        }).catch(() => {});
        const res = await fetch(
          `/api/v2/documents/${encodeURIComponent(landingId)}/${fmt}?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `documento.${fmt}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } catch (e) {
        console.error("[doc] export failed", e);
        alert("No se pudo exportar. Intenta de nuevo en un momento.");
      } finally {
        setExporting(null);
      }
    },
    [editor, exporting, token, persistSectionId, landingId],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f3f5]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur">
        <span className="text-xs font-medium text-neutral-500">Documento</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={share}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50"
          >
            {shared ? "Link copiado ✓" : "Compartir"}
          </button>
          <button
            type="button"
            onClick={() => exportDoc("pdf")}
            disabled={!!exporting}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50"
          >
            {exporting === "pdf" ? "Generando…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => exportDoc("docx")}
            disabled={!!exporting}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50"
          >
            {exporting === "docx" ? "Generando…" : "Descargar Word"}
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-[820px]">
          <div className="min-h-[1000px] rounded-md bg-white px-6 py-12 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)] ring-1 ring-neutral-200/70 sm:px-14">
            <BlockNoteView editor={editor} theme="light" />
          </div>
        </div>
      </div>
    </div>
  );
}
