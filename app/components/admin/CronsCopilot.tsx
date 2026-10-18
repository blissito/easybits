import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPostStreamTransport, Piloto, type PermissionHandler, type ToolVerbs } from "ghosty-autopilot";
import "ghosty-autopilot/styles.css";

const CHAT_URL = "/api/v2/admin/copilot/chat";

// Las tools de admin-crons en primera persona, como los verbos de casa de Piloto.
const VERBS: ToolVerbs = {
  list_crons: { one: "Revisé los crons", many: "Revisé los crons %n veces", running: "Revisando los crons…" },
  get_cron_runs: { one: "Leí el historial de corridas", many: "Leí %n historiales de corridas", running: "Leyendo corridas…" },
  run_cron: { one: "Propuse ejecutar un cron", many: "Propuse %n ejecuciones", running: "Preparando la ejecución…" },
  pause_cron: { one: "Propuse pausar un cron", many: "Propuse %n pausas", running: "Preparando la pausa…" },
  list_my_crons: { one: "Revisé tus crons", many: "Revisé tus crons %n veces", running: "Revisando tus crons…" },
  create_cron: { one: "Propuse crear un cron", many: "Propuse %n crons nuevos", running: "Preparando el cron…" },
  update_cron: { one: "Propuse cambiar un cron", many: "Propuse %n cambios", running: "Preparando el cambio…" },
  delete_cron: { one: "Propuse borrar un cron", many: "Propuse borrar %n crons", running: "Preparando el borrado…" },
  run_my_cron: { one: "Propuse correr tu cron", many: "Propuse %n corridas", running: "Preparando la corrida…" },
};
// El worker nombra las tools `mcp_easybits_<tool>` (un guion bajo): Piloto sólo reconoce `mcp__server__tool`.
const TOOL_VERBS: ToolVerbs = Object.fromEntries(
  Object.entries(VERBS).flatMap(([name, verb]) => [
    [name, verb],
    [`mcp_easybits_${name}`, verb],
  ])
);

// El servidor antepone al texto del turno lo que se ve en pantalla; en el historial no se muestra.
const stripContext = (text: string) => text.replace(/^\[Contexto del panel — [^\]]*\]\n/, "");

// La aprobación va por la ruta con SESIÓN (nunca por el agente): aprobar ejecuta una sola vez.
const approve: PermissionHandler = async (id, optionId) => {
  const res = await fetch(`/api/v2/admin/agent-actions/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: optionId === "approve" ? "approve" : "reject" }),
  });
  const json = (await res.json().catch(() => null)) as { status?: string; message?: string; error?: string } | null;
  // Vencida o ya contestada (otra pestaña): la tarjeta sale sin repetir la acción.
  if (res.status === 404 || res.status === 409) return { resolved: false, detail: json?.message };
  if (res.status === 422) return { resolved: true, detail: `falló: ${json?.error ?? "error"}` };
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Error ${res.status}`);
  return { resolved: true, detail: json?.status === "executed" ? "ejecutado" : json?.status === "rejected" ? "rechazado" : json?.status };
};

interface Props {
  /** Pregunta para dejar en la caja (sin mandarla); `key` cambia en cada pedido. */
  ask: { text: string; key: number } | null;
  /** La tarea de la que se está hablando (viaja como contexto en cada turno). */
  job: { key: string; name: string } | null;
  onClearJob: () => void;
  onClose: () => void;
  /** Otro diálogo encima (el de corridas) se queda con el ESC. */
  escBlocked: boolean;
  /** Fin de turno o decisión: la tabla puede haber cambiado. */
  onChange: () => void;
  /**
   * `panel`: columna del escritorio (pegajosa, de donde empieza hasta abajo de la ventana; ESC cierra).
   * `sheet`: dentro de la hoja de vaul en móvil (llena la hoja; el ESC y el arrastre los lleva vaul).
   */
  variant: "panel" | "sheet";
}

export function CronsCopilot({ ask, job, onClearJob, onClose, escBlocked, onChange, variant }: Props) {
  const transport = useMemo(() => createPostStreamTransport({ url: CHAT_URL }), []);
  const jobRef = useRef(job);
  jobRef.current = job;
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

  const onPermission: PermissionHandler = async (id, optionId) => {
    const out = await approve(id, optionId);
    onChange();
    return out;
  };

  return (
    <aside
      ref={aside}
      aria-label="Piloto de crons"
      style={variant === "panel" && height ? ({ "--copilot-h": `${height}px` } as CSSProperties) : undefined}
      className={
        variant === "panel"
          ? "sticky top-0 flex h-[var(--copilot-h,100vh)] w-full flex-col overflow-hidden border-l-2 border-black bg-white"
          : "flex h-full w-full flex-col overflow-hidden bg-white"
      }
    >
      <header className="flex items-center gap-2 border-b-2 border-black px-4 py-3">
        <h3 className="font-black">Piloto</h3>
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
          className="ml-auto rounded-lg border-2 border-black px-2 py-0.5 text-sm font-bold hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9870ED]"
        >
          Cerrar
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <Piloto
          draft={ask}
          transport={transport}
          skin="easybits"
          agentName="Piloto"
          welcome="Dime qué necesitas de los crons y yo me encargo: revisar por qué falló uno, correrlo o pausarlo. Antes de ejecutar o pausar te pido permiso."
          suggestions={["Revisa qué cron falló hoy y dime por qué", "Pausa los crons que estén fallando"]}
          placeholder="Dime qué hago con los crons…"
          context={() => ({ page: "crons", ...(jobRef.current ? { job: jobRef.current.key } : {}) })}
          toolVerbs={TOOL_VERBS}
          formatUserText={stripContext}
          onPermission={onPermission}
          onTurnDone={onChange}
          className="crons-copilot"
          features={{ attachments: false, models: false }}
          style={{ height: "100%" }}
        />
      </div>
    </aside>
  );
}
