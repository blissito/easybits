import { lazy, Suspense } from "react";
import type { Section3 } from "~/lib/landing3/types";

// Outer del editor SIMPLE del artefacto. Carga SimpleDocEditor LAZY (client-only:
// BlockNote importa CSS a nivel de módulo → rompería el SSR de la ruta). A diferencia
// del colab, NO resuelve caja Hocuspocus ni WS → montaje instantáneo. La co-edición
// (cursores) se levanta SOLO al COMPARTIR (botón → /collab/document/:token).
const SimpleDocEditor = lazy(() => import("./SimpleDocEditor"));

function Spinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f3f3f5]">
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <div className="size-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

export default function SimpleDocumentEditor({
  landingId,
  sections,
  token,
}: {
  landingId: string;
  sections: Section3[];
  token: string;
}) {
  return (
    <Suspense fallback={<Spinner label="Cargando documento…" />}>
      <SimpleDocEditor landingId={landingId} sections={sections} token={token} />
    </Suspense>
  );
}
