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
          body: JSON.stringify({
            sectionId: persistSectionId,
            html: `<section class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`,
          }),
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

  return (
    <div className="min-h-screen bg-surface-2">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5">
        <span
          className={`inline-block size-2 rounded-full ${
            status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-amber-500" : "bg-red-500"
          }`}
        />
        <span className="text-xs text-muted">
          {status === "connected" ? "Co-edición en vivo" : status === "connecting" ? "Conectando…" : "Desconectado"}
          {!editable && " · solo lectura"}
        </span>
      </div>
      <div className="mx-auto max-w-[8.5in] px-4 py-8">
        <div className="rounded-lg border border-border bg-surface py-10 shadow-sm">
          <BlockNoteView editor={editor} editable={editable} />
        </div>
      </div>
    </div>
  );
}
