import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Section3 } from "~/lib/landing3/types";

// Editor colaborativo del artefacto. BlockNote (Notion-like, toolbar+slash+colab
// Yjs out of the box) se carga LAZY → client-only, no rompe el SSR de la ruta.
// El outer resuelve la caja `collab` del owner (async /room) y muestra "conectando".
const CollabBlockNoteEditor = lazy(() => import("./CollabBlockNoteEditor"));

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-surface">{children}</div>;
}
function Spinner({ label }: { label: string }) {
  return (
    <Centered>
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        <p className="text-sm">{label}</p>
      </div>
    </Centered>
  );
}

export default function CollabDocumentEditor({
  landingId,
  sections,
  token,
  embed,
}: {
  landingId: string;
  sections: Section3[];
  token: string;
  embed: boolean;
}) {
  const [room, setRoom] = useState<{ wsUrl: string; room: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <Centered>
        <div className="text-center">
          <p className="text-lg font-medium text-ink">No se pudo conectar a la co-edición</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      </Centered>
    );
  }
  if (!room) return <Spinner label="Conectando a la co-edición…" />;

  return (
    <Suspense fallback={<Spinner label="Cargando editor…" />}>
      <CollabBlockNoteEditor
        wsUrl={room.wsUrl}
        room={room.room}
        token={token}
        initialHtml={initialHtml}
        persistSectionId={persistSectionId}
        editable={true}
      />
    </Suspense>
  );
}
