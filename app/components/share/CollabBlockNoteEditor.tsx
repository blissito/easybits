import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

// Editor colaborativo real (BlockNote: editor block-based estilo Notion sobre
// ProseMirror/Tiptap). Trae toolbar de formato, slash menu y drag handles OUT OF
// THE BOX + colaboración Yjs nativa → NO reinventamos toolbar ni sync. Se conecta
// a nuestro Hocuspocus (caja `collab` del owner). Este archivo se carga LAZY
// (client-only) desde CollabDocumentEditor para no romper el SSR de la ruta.
//
// editable = (permission === "edit"). Los tiers view/comment (BlockNote los
// soporta nativo: read-only + @blocknote/core/comments) se prenden con el
// permission del token — capa siguiente.

const COLORS = ["#e11d48", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#db2777"];

// Envuelve el HTML del editor en un <section> de página (Tailwind) para que el
// pipeline de PDF/deploy/export lo renderice como documento, no prosa pelada.
function wrapAsPage(innerHtml: string): string {
  return `<section class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`;
}

export default function CollabBlockNoteEditor({
  wsUrl,
  room,
  token,
  initialHtml,
  persistSectionId,
  editable,
}: {
  wsUrl: string;
  room: string;
  token: string;
  initialHtml: string;
  persistSectionId: string;
  editable: boolean;
}) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const seeded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(
    () => new HocuspocusProvider({ url: wsUrl, name: room, token, document: ydoc }),
    [wsUrl, room, token, ydoc],
  );
  const user = useMemo(
    () => ({ name: "Editor", color: COLORS[Math.floor(Math.random() * COLORS.length)] }),
    [],
  );

  const editor = useCreateBlockNote(
    {
      collaboration: {
        fragment: ydoc.getXmlFragment("document-store"),
        user,
        provider: { awareness: provider.awareness ?? undefined },
        showCursorLabels: "activity",
      },
    },
    [provider],
  );

  // Snapshot HTML → Landing.sections (debounced) reusando el endpoint del share.
  const persist = useCallback(
    (innerHtml: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/v2/share/documents/${encodeURIComponent(token)}/section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sectionId: persistSectionId, html: wrapAsPage(innerHtml) }),
        }).catch((e) => console.error("[collab] persist failed", e));
      }, 800);
    },
    [token, persistSectionId],
  );

  useEffect(() => {
    const onStatus = (e: { status: string }) =>
      setStatus(e.status === "connected" ? "connected" : e.status === "connecting" ? "connecting" : "disconnected");
    provider.on("status", onStatus);
    return () => {
      provider.off("status", onStatus);
    };
  }, [provider]);

  // Siembra desde las sections una sola vez si el doc Yjs está vacío (primer
  // editor). BlockNote parsea el HTML a bloques.
  useEffect(() => {
    if (!editor || !editable) return;
    const onSynced = async () => {
      if (seeded.current) return;
      const doc = editor.document;
      const isEmpty =
        doc.length <= 1 && (!doc[0] || (doc[0] as { content?: unknown[] }).content?.length === 0);
      if (isEmpty && initialHtml.trim()) {
        seeded.current = true;
        const blocks = await editor.tryParseHTMLToBlocks(initialHtml);
        if (blocks.length) editor.replaceBlocks(editor.document, blocks);
      }
    };
    provider.on("synced", onSynced);
    return () => {
      provider.off("synced", onSynced);
    };
  }, [provider, editor, initialHtml, editable]);

  // Persiste en cada cambio.
  useEffect(() => {
    if (!editor || !editable) return;
    return editor.onChange(async () => {
      const html = await editor.blocksToFullHTML(editor.document);
      persist(html);
    });
  }, [editor, editable, persist]);

  useEffect(
    () => () => {
      provider.destroy();
      ydoc.destroy();
    },
    [provider, ydoc],
  );

  // Exportar PDF/Word. Antes de exportar, FLUSHEA el HTML actual a Landing.sections
  // (el snapshot es debounced) para no exportar contenido viejo. room = landingId.
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);
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
          `/api/v2/documents/${encodeURIComponent(room)}/${fmt}?token=${encodeURIComponent(token)}`,
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
        console.error("[collab] export failed", e);
        alert("No se pudo exportar. Intenta de nuevo en un momento.");
      } finally {
        setExporting(null);
      }
    },
    [editor, exporting, token, persistSectionId, room],
  );

  // Documento SIEMPRE en claro (como Word/Google Docs), independiente del tema del
  // sistema: hoja blanca centrada con sombra sobre un canvas gris. BlockNote aporta
  // la barra de formato flotante (al seleccionar) + slash menu (/) + drag handles.
  return (
    <div className="flex min-h-screen flex-col bg-[#f3f3f5]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur">
        <span
          className={`inline-block size-2 rounded-full ${
            status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-amber-400" : "bg-red-500"
          }`}
        />
        <span className="text-xs font-medium text-neutral-500">
          {status === "connected" ? "Co-edición en vivo" : status === "connecting" ? "Conectando…" : "Desconectado"}
          {!editable && " · solo lectura"}
        </span>
        {/* Descargas — claras para un abogado: PDF y Word. */}
        <div className="ml-auto flex items-center gap-2">
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
            <BlockNoteView editor={editor} editable={editable} theme="light" />
          </div>
        </div>
      </div>
    </div>
  );
}
