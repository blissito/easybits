import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, usePanelRef, type LayoutChangedMeta } from "react-resizable-panels";
import { Drawer } from "vaul";
import "./CopilotSplit.css";

// Copiloto al lado del contenido (sacado de /dash/admin/crons para reusarlo en «Mis crons").
// Escritorio: panel redimensionable que EMPUJA el contenido (abrir y cerrar se animan; arrastrar,
// no). Móvil: hoja de vaul desde abajo con dos alturas. Se monta al abrirlo por primera vez y
// queda vivo: cerrar no pierde el hilo.

/** Hoja móvil: a media pantalla (se ve el contenido) o casi completa. */
const SHEET_SNAPS = [0.6, 0.94];

export type CopilotVariant = "panel" | "sheet";

export function useCopilotSplit(widthKey: string) {
  const isDesktop = useIsDesktop();
  const panelRef = usePanelRef();
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Al pasar a móvil con el panel abierto, se cierra el panel y sigue en la hoja.
  useEffect(() => {
    const panel = panelRef.current;
    if (isDesktop || !panel || panel.isCollapsed()) return;
    panel.collapse();
    setSheetOpen(true);
  }, [isDesktop, panelRef]);

  const open = useCallback(() => {
    setMounted(true);
    if (!isDesktop) return setSheetOpen(true);
    const panel = panelRef.current;
    if (!panel || !panel.isCollapsed()) return;
    panel.expand();
    panel.resize(`${readWidth(widthKey)}px`);
  }, [isDesktop, panelRef, widthKey]);

  const close = useCallback(() => {
    panelRef.current?.collapse();
    setSheetOpen(false);
  }, [panelRef]);

  return {
    isDesktop,
    panelRef,
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    mounted,
    widthKey,
    /** Abierto en la forma que toca (panel o hoja). */
    isOpen: isDesktop ? panelOpen : sheetOpen,
    open,
    close,
  };
}

export type CopilotSplitState = ReturnType<typeof useCopilotSplit>;

export function CopilotSplit({
  id,
  split,
  title,
  copilot,
  children,
  minContent = 420,
  className = "",
}: {
  /** Id del layout (react-resizable-panels lo usa para el estado). */
  id: string;
  split: CopilotSplitState;
  /** Nombre para lectores de pantalla en la hoja móvil. */
  title: string;
  copilot: (variant: CopilotVariant) => ReactNode;
  children: ReactNode;
  /** Ancho mínimo del contenido en escritorio, en px. */
  minContent?: number;
  className?: string;
}) {
  const { isDesktop, panelRef, panelOpen, setPanelOpen, sheetOpen, setSheetOpen, mounted, widthKey } = split;
  const [sheetSnap, setSheetSnap] = useState<number>(SHEET_SNAPS[0]);
  const sheetChat = useRef<HTMLDivElement>(null);
  const [sheetChatH, setSheetChatH] = useState<number | null>(null);

  // Lo visible de la hoja = de donde empieza el chat hasta el borde de abajo; se mide mientras vaul la acomoda.
  useEffect(() => {
    if (!sheetOpen) return;
    let frame = 0;
    const until = performance.now() + 700;
    const measure = () => {
      const el = sheetChat.current;
      if (el) setSheetChatH(Math.max(240, Math.round(window.innerHeight - el.getBoundingClientRect().top)));
      if (performance.now() < until) frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [sheetOpen, sheetSnap]);

  // El ancho que el usuario eligió arrastrando se recuerda (sólo el ancho: siempre arranca cerrado).
  const onLayoutChanged = (_: unknown, meta: LayoutChangedMeta) => {
    const px = panelRef.current?.getSize().inPixels ?? 0;
    if (meta.isUserInteraction && px > 0) writeWidth(widthKey, px);
  };

  return (
    <>
      <div className={className}>
        <Group id={id} className="copilot-layout" style={{ overflow: "clip" }} onLayoutChanged={onLayoutChanged}>
          <Panel id={`${id}-content`} minSize={isDesktop ? minContent : 0} style={{ overflow: "clip", minWidth: 0 }}>
            {children}
          </Panel>
          <Separator className={`copilot-separator max-lg:hidden ${panelOpen ? "" : "invisible"}`} aria-label="Cambiar el ancho del piloto" />
          <Panel
            id={`${id}-copilot`}
            panelRef={panelRef}
            collapsible
            collapsedSize={0}
            defaultSize={0}
            minSize={320}
            maxSize="60%"
            style={{ overflow: "clip", minWidth: 0 }}
            onResize={(size) => setPanelOpen(size.inPixels > 0)}
          >
            {/* Cerrado sigue montado (el hilo no se pierde), pero fuera del foco y del lector de pantalla. */}
            {mounted && isDesktop && (
              <div className="h-full" inert={!panelOpen}>
                {copilot("panel")}
              </div>
            )}
          </Panel>
        </Group>
      </div>
      {!isDesktop && (
        <Drawer.Root
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          snapPoints={SHEET_SNAPS}
          activeSnapPoint={sheetSnap}
          setActiveSnapPoint={(p) => setSheetSnap(typeof p === "number" ? p : SHEET_SNAPS[0])}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-black/30" />
            <Drawer.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex h-[94dvh] flex-col rounded-t-2xl border-2 border-b-0 border-black bg-white outline-none"
            >
              <Drawer.Handle className="!my-2 !h-1.5 !w-12 shrink-0 !bg-gray-300" />
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
              {/* vaul desplaza la hoja: el chat mide lo VISIBLE en cada punto, para que el composer no quede abajo de la pantalla. */}
              <div
                ref={sheetChat}
                className="min-h-0"
                style={{ height: sheetChatH ? `${sheetChatH}px` : `calc(${Math.round(sheetSnap * 100)}dvh - 3rem)` }}
              >
                {mounted && copilot("sheet")}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}

function readWidth(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    if (n >= 320) return n;
  } catch {
    /* sin almacenamiento: ancho por defecto */
  }
  return 420;
}

function writeWidth(key: string, px: number) {
  try {
    localStorage.setItem(key, String(Math.round(px)));
  } catch {
    /* sin almacenamiento */
  }
}

/** `lg` de Tailwind: panel lateral desde 1024 px, hoja de vaul debajo. En el servidor, escritorio. */
export function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}
