import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createAgUiTransport, definePlugin, Piloto, type ToolVerbs } from "ghostykit";
import "ghostykit/styles.css";
import { PiXBold } from "react-icons/pi";

const CHAT_URL = "/api/v2/admin/copilot/chat";
const MY_CRONS_CHAT_URL = "/api/v2/copilot/crons/chat";

// Las tools de admin-crons en primera persona, como los verbos de casa de Piloto.
const VERBS: ToolVerbs = {
  list_crons: { one: "Revisé los crons", many: "Revisé los crons %n veces", running: "Revisando los crons…" },
  get_cron_runs: { one: "Leí el historial de ejecuciones", many: "Leí %n historiales de ejecuciones", running: "Leyendo ejecuciones…" },
  run_cron: { one: "Propuse ejecutar un cron", many: "Propuse %n ejecuciones", running: "Preparando la ejecución…" },
  pause_cron: { one: "Propuse pausar un cron", many: "Propuse %n pausas", running: "Preparando la pausa…" },
  list_my_crons: { one: "Revisé tus crons", many: "Revisé tus crons %n veces", running: "Revisando tus crons…" },
  create_cron: { one: "Propuse crear un cron", many: "Propuse %n crons nuevos", running: "Preparando el cron…" },
  update_cron: { one: "Propuse cambiar un cron", many: "Propuse %n cambios", running: "Preparando el cambio…" },
  delete_cron: { one: "Propuse borrar un cron", many: "Propuse borrar %n crons", running: "Preparando el borrado…" },
  run_my_cron: { one: "Propuse ejecutar tu cron", many: "Propuse %n ejecuciones", running: "Preparando la ejecución…" },
  // El paso que pone el servidor al contestar una tarjeta (resume de AG-UI).
  confirm_action: { one: "Apliqué tu decisión", many: "Apliqué %n decisiones", running: "Aplicando tu decisión…" },
  wait_cron_run: { one: "Esperé a que terminara", many: "Esperé %n ejecuciones", running: "Esperando a que termine…" },
  db_list: { one: "Revisé tus bases de datos", many: "Revisé tus bases %n veces", running: "Revisando tus bases…" },
  db_query: { one: "Consulté una base", many: "Hice %n consultas", running: "Consultando…" },
  secret_list: { one: "Revisé los nombres de tu bóveda", many: "Revisé tu bóveda %n veces", running: "Revisando tu bóveda…" },
};
// El servidor antepone al texto del turno lo que se ve en pantalla; en el historial no se muestra.
const stripContext = (text: string) =>
  text.replace(/^\[Contexto del panel — [^\]]*\]\n/, "").replace(/^\[Estado de los crons ahora[^\]]*\]\n(?:- .*\n)*(?:\[Sus apps[^\]]*\]\n(?:- .*\n)*)?/, "");

// Lo propio de este piloto, con nombre (ghostykit 0.7: los plugins son la forma de personalizar).
// Los verbos sirven también para `mcp_easybits_<tool>`: ghostykit prueba cada sufijo del nombre.
const PLUGINS = [definePlugin({ name: "crons", tools: { verbs: VERBS }, message: { formatUserText: stripContext } })];

// Un solo hilo por cuenta y superficie (el servidor lo guarda): al abrir, Piloto lo pide con un run vacío.
const SURFACES = {
  admin: {
    url: CHAT_URL,
    threadId: "admin-crons",
    agentName: "Piloto",
    page: "crons",
    welcome:
      "Dime qué necesitas de los crons y yo me encargo: revisar por qué falló uno, ejecutarlo o pausarlo. Antes de ejecutar o pausar te pido permiso.",
    suggestions: ["Revisa qué cron falló hoy y dime por qué", "Pausa los crons que estén fallando"],
    placeholder: "Dime qué hago con los crons…",
  },
  mine: {
    url: MY_CRONS_CHAT_URL,
    threadId: "my-crons",
    agentName: "Bittor",
    page: "my-crons",
    welcome:
      "Soy Bittor. Te ayudo con tus crons: crearlos en palabras («cada lunes a las 9…»), ver por qué falló uno o ejecutarlo. Antes de cambiar algo te pido permiso en una tarjeta.",
    suggestions: [
      "Créame un cron que revise mi sitio cada hora",
      "¿Por qué falló mi último cron?",
      "Ejecuta mi cron más reciente",
    ],
    placeholder: "Pídele algo a Bittor…",
  },
} as const;

interface Props {
  /** Pregunta para dejar en la caja (sin mandarla); `key` cambia en cada pedido. */
  ask: { text: string; key: number } | null;
  /** La tarea de la que se está hablando (viaja como contexto en cada turno). */
  job: { key: string; name: string } | null;
  onClearJob: () => void;
  onClose: () => void;
  /** Otro diálogo encima (el de ejecuciones) se queda con el ESC. */
  escBlocked: boolean;
  /** Fin de turno o decisión: la tabla puede haber cambiado. */
  onChange: () => void;
  /**
   * `panel`: columna del escritorio (pegajosa, de donde empieza hasta abajo de la ventana; ESC cierra).
   * `sheet`: dentro de la hoja de vaul en móvil (llena la hoja; el ESC y el arrastre los lleva vaul).
   */
  variant: "panel" | "sheet";
  /** `admin`: el piloto de la plataforma; `mine`: Bittor de «Mis crons» (cualquier cuenta). */
  surface?: keyof typeof SURFACES;
  /** Cron propio abierto en «Mis crons» (viaja como contexto). */
  cronId?: string | null;
}

export function CronsCopilot({ ask, job, onClearJob, onClose, escBlocked, onChange, variant, surface = "admin", cronId }: Props) {
  const cfg = SURFACES[surface];
  // AG-UI: aprobar o rechazar una tarjeta es el `resume` del siguiente run, con la cookie de sesión.
  const transport = useMemo(() => createAgUiTransport({ url: cfg.url }), [cfg.url]);
  const jobRef = useRef(job);
  jobRef.current = job;
  const cronRef = useRef(cronId);
  cronRef.current = cronId;
  const aside = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  // Columna pegajosa: llena de donde empieza hasta abajo de la ventana (el composer siempre a la vista).
  // La primera medida va ANTES de pintar: Piloto enfoca la caja al montar y, con la altura provisional
  // (100vh), la caja quedaría bajo el borde y el navegador desplazaría la página.
  useLayoutEffect(() => {
    if (variant !== "panel") return;
    const fit = () => {
      const el = aside.current;
      if (el) setHeight(Math.max(320, window.innerHeight - Math.max(el.getBoundingClientRect().top, 0)));
    };
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== "panel") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || escBlocked) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escBlocked, onClose, variant]);

  return (
    <aside
      ref={aside}
      aria-label={surface === "mine" ? "Bittor" : "Piloto de crons"}
      style={variant === "panel" && height ? ({ "--copilot-h": `${height}px` } as CSSProperties) : undefined}
      className={
        variant === "panel"
          ? "sticky top-0 flex h-[var(--copilot-h,100vh)] w-full flex-col overflow-hidden border-l-2 border-black bg-white"
          : "flex h-full w-full flex-col overflow-hidden bg-white"
      }
    >
      <header className="flex items-center gap-2 border-b-2 border-black px-4 py-3">
        <h3 className="font-black">{cfg.agentName}</h3>
        {job && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full border-2 border-black bg-[#fbbf24] px-2 py-0.5 text-xs font-bold">
            <span className="truncate">{job.name}</span>
            <button type="button" onClick={onClearJob} aria-label="Quitar la tarea del contexto" className="leading-none">
              ×
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar"
          className="ml-auto grid size-8 place-items-center rounded-full text-lg text-gray-600 hover:bg-gray-100 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9870ED]"
        >
          <PiXBold />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <Piloto
          draft={ask}
          transport={transport}
          threadId={cfg.threadId}
          skin="easybits"
          agentName={cfg.agentName}
          welcome={cfg.welcome}
          suggestions={[...cfg.suggestions]}
          placeholder={cfg.placeholder}
          context={() => ({
            page: cfg.page,
            ...(jobRef.current ? { job: jobRef.current.key } : {}),
            ...(cronRef.current ? { cron: cronRef.current } : {}),
          })}
          plugins={PLUGINS}
          onTurnDone={onChange}
          className="crons-copilot"
          features={{ attachments: false }}
          style={{ height: "100%" }}
        />
      </div>
    </aside>
  );
}
