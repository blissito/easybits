import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import type { Section3 } from "~/lib/landing3/types";

// Editor colaborativo (Tiptap + Yjs) del artefacto. A diferencia del share editor
// canvas/iframe, esto es UN documento de prosa co-editable en vivo por N personas
// (y, en Fase 3b, por @ghosty como peer). El estado vive en un Y.Doc sincronizado
// por Hocuspocus (caja `collab` del owner); el HTML durable se snapshotea a
// Landing.sections vía el endpoint por-sección existente.
//
// ⚠️ MVP: colapsa el documento a UNA sección de prosa (los contratos/dictámenes
// son prosa continua). El wrapper de página con Tailwind se re-aplica al
// persistir. La reconciliación multi-página fiel es follow-up (ver plan).

type Props = {
  landingId: string;
  sections: Section3[];
  token: string;
  embed: boolean;
};

// Envuelve la prosa del editor en un <section> con el marco de página para que
// el pipeline de PDF/deploy la renderice como documento (no prosa pelada).
function wrapAsPage(innerHtml: string): string {
  return `<section class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`;
}

export default function CollabDocumentEditor({ landingId, sections, token, embed }: Props) {
  const [room, setRoom] = useState<{ wsUrl: string; room: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Levanta/resume la caja collab del owner y obtiene el ws URL (async, con
  // estado "conectando" — un cold spawn tarda segundos).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/v2/collab/${encodeURIComponent(token)}/room`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setRoom({ wsUrl: data.wsUrl, room: data.room });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const initialHtml = useMemo(
    () => sections.map((s) => s.html).join("\n") || "<p></p>",
    [sections],
  );
  const persistSectionId = sections[0]?.id ?? "page-1";

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-8 text-center">
        <div>
          <p className="text-lg font-medium text-ink">No se pudo conectar a la co-edición</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="size-8 animate-spin rounded-full border-2 border-border border-t-brand" />
          <p className="text-sm">Conectando a la co-edición…</p>
        </div>
      </div>
    );
  }

  return (
    <CollabEditor
      wsUrl={room.wsUrl}
      room={room.room}
      token={token}
      initialHtml={initialHtml}
      landingId={landingId}
      persistSectionId={persistSectionId}
      embed={embed}
    />
  );
}

function CollabEditor({
  wsUrl,
  room,
  token,
  initialHtml,
  landingId,
  persistSectionId,
}: {
  wsUrl: string;
  room: string;
  token: string;
  initialHtml: string;
  landingId: string;
  persistSectionId: string;
  embed: boolean;
}) {
  const seeded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  const ydoc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(
    () => new HocuspocusProvider({ url: wsUrl, name: room, token, document: ydoc }),
    [wsUrl, room, token, ydoc],
  );

  // Persiste el snapshot HTML a Landing.sections (debounced) — durabilidad
  // legible; el Y.Doc es el estado vivo. Reusa el endpoint del share editor.
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

  const editor = useEditor(
    {
      extensions: [
        // Collaboration provee undo/redo vía Yjs → desactivar el de StarterKit.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: ydoc }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[60vh]",
        },
      },
      onUpdate: ({ editor }) => persist(editor.getHTML()),
    },
    [provider],
  );

  // Estado de conexión (badge).
  useEffect(() => {
    const onStatus = (e: { status: string }) =>
      setStatus(e.status === "connected" ? "connected" : e.status === "connecting" ? "connecting" : "disconnected");
    provider.on("status", onStatus);
    return () => {
      provider.off("status", onStatus);
    };
  }, [provider]);

  // Siembra el Y.Doc UNA vez desde las sections si está vacío (primer editor que
  // entra). Yjs sincroniza al resto; los que llegan después heredan el estado.
  useEffect(() => {
    if (!editor) return;
    const onSynced = () => {
      if (!seeded.current && editor.isEmpty && initialHtml.trim()) {
        seeded.current = true;
        editor.commands.setContent(initialHtml, { emitUpdate: false });
      }
    };
    provider.on("synced", onSynced);
    return () => {
      provider.off("synced", onSynced);
    };
  }, [provider, editor, initialHtml]);

  // Limpieza.
  useEffect(
    () => () => {
      provider.destroy();
      ydoc.destroy();
    },
    [provider, ydoc],
  );

  return (
    <div className="min-h-screen bg-surface-2">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <span
          className={`inline-block size-2 rounded-full ${
            status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-amber-500" : "bg-red-500"
          }`}
        />
        <span className="text-xs text-muted">
          {status === "connected" ? "Co-edición en vivo" : status === "connecting" ? "Conectando…" : "Desconectado"}
        </span>
      </div>
      <div className="mx-auto max-w-[8.5in] px-6 py-8">
        <div className="rounded-lg border border-border bg-surface p-10 shadow-sm">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
