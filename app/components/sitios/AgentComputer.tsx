import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuFileCode, LuGlobe, LuListChecks, LuPause, LuPlay, LuSearch, LuTerminal, LuWrench } from "react-icons/lu";
import { KIND_LABEL, currentPlan, isPlumbing, stepVerb, type AgentStep, type StepKind, type StepTodo } from "~/lib/agentSteps";

type BrowserTarget = NonNullable<NonNullable<AgentStep["browser"]>["target"]>;

/**
 * «La computadora del agente»: lo que el agente está haciendo, paso por paso, al lado del
 * chat. Spec tomada de «Manus's Computer» (encabezado con la herramienta en uso, una vista
 * por herramienta, barra de tiempo con «en vivo» y «volver a en vivo», tarjeta del paso) y de
 * Suna en el celular (anterior / i de N / siguiente). Sobre Manus: marca el elemento que se
 * tocó y dice la acción encima de la captura. Investigación: docs/claude/funnel-agentico-2026-10.md.
 *
 * El mismo componente sirve en vivo (`live`) y en replay: sólo cambia si sigue al último paso.
 */

const ICON: Record<StepKind, typeof LuGlobe> = { browser: LuGlobe, terminal: LuTerminal, editor: LuFileCode, search: LuSearch, other: LuWrench };

/** Ritmo del replay: un paso cada tanto, como el «play» de Manus. */
const PLAY_MS = 1600;

/**
 * `agentName`: «Ghosty» → «La computadora de Ghosty»; sin nombre, «del agente».
 * `autoplay`: replay compartido — arranca en el paso 1 y avanza solo.
 */
/** Pide a EasyBits tomar el control de un navegador del turno en curso de un sitio. */
export async function requestTakeover(siteId: string, sessionId: string): Promise<TakeoverUrls> {
  const r = await fetch(`/api/v2/sites/${siteId}/takeover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo tomar el control");
  return d;
}

/** Pide la pestaña en vivo (sólo mirar) de un navegador del turno en curso. */
export async function requestWatch(siteId: string, sessionId: string): Promise<{ liveUrl: string }> {
  const r = await fetch(`/api/v2/sites/${siteId}/watch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo ver el navegador en vivo");
  return d;
}

type LiveFrame = { data: string; url: string };

/**
 * La pestaña en vivo por SSE (screencast de la caja). Chrome sólo manda frame cuando algo
 * cambia: se queda el último, así una página quieta nunca deja la vista vacía. `gone` = el
 * navegador se cerró o expiró (el EventSource no reintenta tras un 404).
 */
function useScreencast(url: string | null) {
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setFrame(null);
    setGone(false);
    if (!url) return;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        setFrame(JSON.parse(e.data));
      } catch {
        /* frame malformado */
      }
    };
    es.addEventListener("gone", () => {
      setGone(true);
      es.close();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setGone(true);
    };
    return () => es.close();
  }, [url]);
  return { frame, gone };
}

export type TakeoverUrls = { liveUrl: string; inputUrl: string; releaseUrl: string; viewport: { width: number; height: number } | null };

export function AgentComputer({
  steps: allSteps,
  live,
  agentName,
  autoplay = false,
  onTakeover,
  onWatch,
  jumpTo,
  onStepChange,
}: {
  steps: AgentStep[];
  live: boolean;
  agentName?: string;
  autoplay?: boolean;
  /** «Tomar el control» del navegador; sin esto el botón no aparece (replay, otras superficies). */
  onTakeover?: (sessionId: string) => Promise<TakeoverUrls>;
  /** Ver el navegador moverse en vivo mientras el agente lo usa; sin esto, sólo capturas por paso. */
  onWatch?: (sessionId: string) => Promise<{ liveUrl: string }>;
  /** Llevar el panel a un paso desde fuera (el chat); `at` distingue dos clics al mismo paso. */
  jumpTo?: { id: string; at: number } | null;
  /** El paso que se ve ahora (null = siguiendo en vivo), para resaltarlo en el chat. */
  onStepChange?: (id: string | null) => void;
}) {
  const [takeover, setTakeover] = useState<TakeoverUrls | null>(null);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const owner = agentName ? `de ${agentName}` : "del agente";
  // El plan (TodoWrite) no es un paso que se mire: va en su franja, arriba.
  const steps = useMemo(() => allSteps.filter((s) => !isPlumbing(s.tool)), [allSteps]);
  // null = seguir en vivo (el último paso). Un número = el visitante retrocedió a ese paso.
  const [pinned, setPinned] = useState<number | null>(autoplay && steps.length > 1 ? 0 : null);
  const [playing, setPlaying] = useState(autoplay);
  const last = steps.length - 1;
  const idx = pinned === null ? last : Math.min(pinned, last);
  const raw = steps[idx];
  // Un paso del navegador sin captura propia («abriendo…», cerrar) muestra la última captura,
  // atenuada: antes se quedaba en «Cargando la página…» hasta el final del turno.
  const prevFrame = raw?.kind === "browser" && !raw.browser ? steps.slice(0, idx).reverse().find((s) => s.browser?.image)?.browser : undefined;
  const step = prevFrame ? { ...raw, browser: { ...prevFrame, action: undefined, target: undefined, url: raw.detail ?? prevFrame.url } } : raw;
  const stale = !!prevFrame;
  // De dónde vuela el cursor: el último elemento que tocó antes de este paso.
  const fromTarget = raw?.kind === "browser" ? steps.slice(0, idx).reverse().find((s) => s.browser?.target)?.browser?.target : undefined;
  const following = pinned === null;

  // Pestaña en vivo: sólo siguiendo el último paso de un turno en curso, y nunca mientras la
  // persona tiene el control (esa vista trae su propio stream). Vive aquí y no en BrowserView
  // para no reconectar en cada paso (la vista se remonta con cada captura).
  const watchSession = onWatch && live && following && !takeover && raw?.kind === "browser" ? (step?.browser?.sessionId ?? null) : null;
  const [watch, setWatch] = useState<{ sessionId: string; liveUrl: string } | null>(null);
  useEffect(() => {
    if (!watchSession) return setWatch(null);
    if (watch?.sessionId === watchSession) return;
    let cancelled = false;
    onWatch!(watchSession)
      .then((w) => !cancelled && setWatch({ sessionId: watchSession, liveUrl: w.liveUrl }))
      .catch(() => !cancelled && setWatch(null));
    return () => {
      cancelled = true;
    };
  }, [watchSession]);
  const screencast = useScreencast(watch && watch.sessionId === watchSession ? watch.liveUrl : null);
  const liveFrame = watchSession && !screencast.gone ? screencast.frame : null;

  // El chat pidió un paso: se fija ahí (aunque sea el último, para que no siga brincando).
  useEffect(() => {
    if (!jumpTo) return;
    const i = steps.findIndex((s) => s.id === jumpTo.id);
    if (i === -1) return;
    setPlaying(false);
    setPinned(i);
  }, [jumpTo?.at]);
  useEffect(() => {
    onStepChange?.(pinned === null ? null : (steps[idx]?.id ?? null));
  }, [pinned === null ? null : steps[idx]?.id]);

  // Si el visitante regresa al último paso con la barra, vuelve a seguir en vivo.
  const go = (i: number) => setPinned(i >= last ? null : Math.max(0, i));

  // Reproducir: avanza un paso por tick y se detiene al final.
  useEffect(() => {
    if (!playing) return;
    if (pinned === null) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => go(pinned + 1), PLAY_MS);
    return () => clearTimeout(t);
  }, [playing, pinned]);

  // ← → recorren los pasos (sólo si el foco no está escribiendo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        setPlaying(false);
        go(idx - 1);
      }
      if (e.key === "ArrowRight") {
        setPlaying(false);
        go(idx + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return <EmptyComputer owner={owner} live={live} />;

  const Icon = ICON[step.kind];
  const running = live && following && step.status === "running";
  const plan = currentPlan(allSteps.filter((s) => s.startedAt <= step.startedAt));
  const View = VIEWS[step.kind] ?? GenericView;
  const repeats = repeatCount(steps, idx);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Encabezado: qué herramienta usa y qué hace con ella. */}
      <div className="flex items-center gap-3 border-b-2 border-black px-4 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-black bg-brand-500/15">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            La computadora {owner} · usa {KIND_LABEL[step.kind]}
          </p>
          {/* Lo que el agente dijo que iba a hacer; el comando ya se ve abajo, en la terminal. */}
          <p className="text-sm leading-snug">
            <span className="font-bold">{step.intent ?? stepVerb(step)}</span>
            {(step.browser?.url || step.detail) && <span className="ml-1.5 font-mono text-xs text-gray-500">{step.browser?.url ?? step.detail}</span>}
          </p>
        </div>
      </div>

      {plan && <PlanStrip todos={plan} live={live && following} />}

      {/* La vista de la herramienta. */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-50">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={takeover ? "takeover" : `${step.kind}-${step.kind === "browser" ? step.browser?.image : step.kind === "terminal" ? "t" : step.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0"
          >
            {takeover ? (
              <TakeoverView urls={takeover} onDone={() => setTakeover(null)} />
            ) : step.kind === "browser" ? (
              <BrowserView
                step={step}
                stale={stale && !liveFrame}
                liveFrame={liveFrame}
                fromTarget={fromTarget}
                onTakeover={
                  onTakeover && live && following && step.browser?.sessionId
                    ? async () => {
                        setTakeoverError(null);
                        try {
                          setTakeover(await onTakeover(step.browser!.sessionId!));
                        } catch (e) {
                          setTakeoverError((e as Error).message);
                        }
                      }
                    : undefined
                }
                error={takeoverError}
              />
            ) : (
              <View steps={steps} idx={idx} step={step} running={running} />
            )}
          </motion.div>
        </AnimatePresence>

        {!following && (
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-bold shadow-[3px_3px_0_0_#000] hover:bg-brand-500/15"
          >
            <LuPlay className="size-3.5" /> {live ? "Volver a en vivo" : "Ir al final"}
          </button>
        )}
      </div>

      {/* Barra de tiempo. */}
      <div className="border-t-2 border-black px-3 py-2">
        <div className="flex items-center gap-2">
          {!live && (
            <button
              type="button"
              aria-label={playing ? "Pausar" : "Reproducir"}
              onClick={() => {
                if (!playing && pinned === null) setPinned(0);
                setPlaying((p) => !p);
              }}
              className="rounded-md border-2 border-black p-1 hover:bg-brand-500/15"
            >
              {playing ? <LuPause className="size-3.5" /> : <LuPlay className="size-3.5" />}
            </button>
          )}
          <button type="button" aria-label="Paso anterior" disabled={idx <= 0} onClick={() => go(idx - 1)} className="rounded-md p-1 hover:bg-gray-100 disabled:opacity-30">
            <LuChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Paso siguiente" disabled={idx >= last} onClick={() => go(idx + 1)} className="rounded-md p-1 hover:bg-gray-100 disabled:opacity-30">
            <LuChevronRight className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(last, 0)}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              go(Number(e.target.value));
            }}
            aria-label="Recorrer los pasos"
            className="hidden h-1.5 flex-1 cursor-pointer accent-brand-500 sm:block"
          />
          <span className="flex-1 text-center text-xs font-mono text-gray-500 sm:hidden">
            {idx + 1} de {steps.length}
          </span>
          {live ? (
            <span className={`flex items-center gap-1.5 text-xs font-bold ${following ? "text-green-600" : "text-gray-400"}`}>
              <span className={`size-2 rounded-full ${following ? "animate-pulse bg-green-500" : "bg-gray-300"}`} /> en vivo
            </span>
          ) : (
            <span className="text-xs font-bold text-gray-400">replay</span>
          )}
        </div>
        {/* Tarjeta del paso actual. */}
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <StatusDot status={step.status} running={running} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-bold">{stepVerb(step)}</span>
            {(step.browser?.action || step.detail) && <span className="text-gray-500"> · {step.browser?.action ?? step.detail}</span>}
            {repeats > 1 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 font-mono text-gray-500">×{repeats}</span>}
          </span>
          <span className="shrink-0 font-mono text-gray-400">
            {secondsOf(step, running)} · {idx + 1}/{steps.length}
          </span>
        </div>
      </div>
    </div>
  );
}

function secondsOf(s: AgentStep, running: boolean) {
  const end = s.endedAt ?? (running ? Date.now() : s.startedAt);
  const secs = Math.max(0, Math.round((end - s.startedAt) / 1000));
  return secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function StatusDot({ status, running }: { status: AgentStep["status"]; running: boolean }) {
  if (running) return <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-brand-500" />;
  return <span className={`size-2.5 shrink-0 rounded-full ${status === "error" ? "bg-red-500" : "bg-green-500"}`} />;
}

/** Navegador: barra con la URL, la captura y el elemento tocado marcado encima. */
function BrowserView({
  step,
  stale,
  liveFrame,
  fromTarget,
  onTakeover,
  error,
}: {
  step: AgentStep;
  stale?: boolean;
  /** Último frame de la pestaña en vivo: gana sobre la captura del paso, que queda de respaldo. */
  liveFrame?: LiveFrame | null;
  /** Elemento del clic anterior: el cursor fantasma sale de ahí. */
  fromTarget?: BrowserTarget;
  onTakeover?: () => void;
  error?: string | null;
}) {
  const f = step.browser;
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(0);
  // La captura se escala al ancho del panel: el recuadro del clic se escala igual.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !f?.viewport) return;
    const update = () => setScale(el.clientWidth / f.viewport!.width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f?.image, f?.viewport]);

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-black bg-white">
        <div className="flex items-center gap-2 border-b-2 border-black bg-gray-100 px-3 py-1.5">
          <span className="flex gap-1">
            <span className="size-2.5 rounded-full border border-black bg-red-400" />
            <span className="size-2.5 rounded-full border border-black bg-amber-300" />
            <span className="size-2.5 rounded-full border border-black bg-green-400" />
          </span>
          <span className="mx-auto min-w-0 truncate rounded-md border border-gray-300 bg-white px-3 py-0.5 text-center font-mono text-[11px] text-gray-600">
            {liveFrame?.url ?? f?.url ?? step.detail ?? "abriendo…"}
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          {f ? (
            <div className="relative">
              <img
                ref={imgRef}
                src={liveFrame ? `data:image/jpeg;base64,${liveFrame.data}` : f.image}
                alt={f.title || "Página que ve el agente"}
                className={`block w-full ${stale ? "opacity-50" : ""}`}
              />
              {f.target && scale > 0 && <GhostCursor key={`c-${f.image}`} from={fromTarget} to={f.target} scale={scale} />}
              {f.target && scale > 0 && (
                <motion.span
                  key={f.image}
                  initial={{ opacity: 0, scale: 1.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22, delay: CURSOR_S }}
                  className="pointer-events-none absolute rounded-md border-[3px] border-brand-500 shadow-[0_0_0_4px_rgba(152,112,237,0.25)]"
                  style={{ left: f.target.x * scale - 4, top: f.target.y * scale - 4, width: f.target.width * scale + 8, height: f.target.height * scale + 8 }}
                />
              )}
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-gray-400">{step.status === "running" ? "Cargando la página…" : "Este paso no dejó captura"}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {f?.action && <p className="rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_#000]">{f.action}</p>}
        {onTakeover && (
          <button
            type="button"
            onClick={onTakeover}
            className="ml-auto rounded-full border-2 border-black bg-brand-500 px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5"
          >
            Tomar el control
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Lo que tarda el cursor en llegar; el recuadro y el clic se encienden al aterrizar. */
const CURSOR_S = 0.45;

const centerOf = (t: BrowserTarget, k: number) => ({ x: (t.x + t.width / 2) * k, y: (t.y + t.height / 2) * k });

/**
 * Cursor fantasma: vuela del elemento anterior al que el agente tocó y marca el clic con una
 * onda. Las capturas cambian a saltos; el ojo sigue el movimiento. Lo pinta el visor (no la
 * página), así sirve igual en vivo y en replay. Sin elemento anterior, entra desde arriba.
 */
function GhostCursor({ from, to, scale }: { from?: BrowserTarget; to: BrowserTarget; scale: number }) {
  const end = centerOf(to, scale);
  const start = from ? centerOf(from, scale) : { x: end.x, y: Math.max(0, end.y - 80) };
  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10"
        initial={{ x: start.x, y: start.y, opacity: from ? 1 : 0 }}
        animate={{ x: end.x, y: end.y, opacity: 1 }}
        transition={{ duration: CURSOR_S, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg width="22" height="26" viewBox="0 0 22 26" className="drop-shadow-[2px_2px_0_#000]">
          <path d="M2 2 L2 21 L7.5 16 L11 24 L14.5 22.5 L11 15 L18.5 15 Z" fill="#9870ED" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </motion.span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute size-6 rounded-full border-[3px] border-brand-500"
        style={{ left: end.x - 12, top: end.y - 12 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2.2], opacity: [1, 0] }}
        transition={{ duration: 0.5, delay: CURSOR_S, ease: "easeOut" }}
      />
    </>
  );
}

/** Nombre de la herramienta sin el prefijo del MCP: `sandbox_files_edit`, no `mcp__easybits__sandbox_files_edit`. */
const toolName = (t: string) => t.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");

/** Lo que recibe cada vista del registro: todos los pasos, el elegido y si sigue corriendo. */
type ViewProps = { steps: AgentStep[]; idx: number; step: AgentStep; running: boolean };

/** Una vista por herramienta (patrón de Suna); lo que no tenga la suya cae en GenericView. */
const VIEWS: Partial<Record<StepKind, (p: ViewProps) => React.ReactElement>> = {
  terminal: TerminalView,
  editor: EditorView,
  search: SearchView,
};

/** Cuántas veces seguidas se repitió el mismo paso hasta aquí («Desplazó ×4»). */
function repeatCount(steps: AgentStep[], idx: number): number {
  const key = (s: AgentStep) => `${s.tool}|${s.detail ?? ""}|${s.command ?? ""}|${s.browser?.action ?? ""}`;
  let n = 1;
  while (idx - n >= 0 && key(steps[idx - n]) === key(steps[idx])) n++;
  return n;
}

/** El plan del agente palomeándose: hecho, en curso, pendiente. */
function PlanStrip({ todos, live }: { todos: StepTodo[]; live: boolean }) {
  const done = todos.filter((t) => t.status === "completed").length;
  const current = todos.find((t) => t.status === "in_progress");
  return (
    <details open className="group border-b-2 border-black bg-white px-4 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
        <LuListChecks className="size-4 text-brand-500" />
        <span className="min-w-0 flex-1 truncate">
          Plan · {done} de {todos.length}
          {current && <span className="font-normal text-gray-500"> · {current.activeForm ?? current.content}</span>}
        </span>
        <LuChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
      </summary>
      <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-auto">
        {todos.map((t, i) => (
          <li key={i} className={`flex items-start gap-2 ${t.status === "completed" ? "text-gray-400 line-through" : ""}`}>
            <span className="mt-0.5 w-3 shrink-0 text-center">
              {t.status === "completed" ? "✓" : t.status === "in_progress" ? <span className={`inline-block size-2 rounded-full bg-brand-500 ${live ? "animate-pulse" : ""}`} /> : "○"}
            </span>
            <span className={t.status === "in_progress" ? "font-bold" : ""}>{t.content}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Terminal: todos los comandos del turno hasta el paso elegido, con su salida; el actual resaltado. */
function TerminalView({ steps, idx, running }: ViewProps) {
  const lines = useMemo(() => steps.slice(0, idx + 1).map((s, i) => ({ s, i })).filter(({ s }) => s.kind === "terminal"), [steps, idx]);
  const end = useRef<HTMLDivElement>(null);
  // Al último comando, sin mover la página entera (scrollIntoView arrastraba al documento).
  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length]);
  return (
    <div className="h-full overflow-auto bg-[#0b0b0f] p-4 font-mono text-[12px] leading-5 text-gray-200">
      {lines.map(({ s, i }) => (
        <div key={s.id} className={`mb-2 ${i === idx ? "" : "opacity-60"}`}>
          <div className="break-all">
            <span className="text-[#85DDCB]">$ </span>
            {s.command || s.detail || toolName(s.tool)}
          </div>
          {s.result?.summary && (
            <pre className={`mt-1 whitespace-pre-wrap break-all text-gray-400 ${i === idx ? "max-h-80 overflow-auto" : "line-clamp-3"}`}>{s.result.summary}</pre>
          )}
          <div className={s.status === "error" || (s.result?.exitCode ?? 0) !== 0 ? "text-red-400" : "text-gray-500"}>
            {i === idx && running ? (
              <span className="animate-pulse">▍</span>
            ) : (s.result?.exitCode ?? 0) !== 0 ? (
              `✗ salió con código ${s.result!.exitCode}`
            ) : s.status === "error" ? (
              "✗ terminó con error"
            ) : (
              "✓ listo"
            )}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

/** Editor: los archivos que tocó el turno (árbol plano) y el cambio del actual. */
function EditorView({ steps, idx }: ViewProps) {
  const cur = steps[idx];
  const files = useMemo(() => {
    const seen = new Map<string, AgentStep>();
    for (const s of steps.slice(0, idx + 1)) if (s.kind === "editor" && s.detail) seen.set(s.detail, s);
    return [...seen.values()];
  }, [steps, idx]);
  return (
    <div className="flex h-full">
      <div className="w-40 shrink-0 overflow-auto border-r-2 border-black bg-white py-2 text-xs">
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Archivos</p>
        {files.map((s) => (
          <p key={s.detail} className={`truncate px-3 py-1 font-mono ${s.detail === cur.detail ? "bg-brand-500/15 font-bold" : "text-gray-600"}`}>
            {s.detail}
          </p>
        ))}
      </div>
      {cur.result?.diff ? (
        <div className="min-w-0 flex-1 overflow-auto bg-white font-mono text-[12px] leading-5">
          <p className="sticky top-0 border-b-2 border-black bg-gray-100 px-3 py-1 font-bold">
            {cur.result.diff.file ?? cur.detail} <span className="font-normal text-gray-500">· {stepVerb(cur)}</span>
          </p>
          {cur.result.diff.removed.map((l, i) => (
            <div key={`r${i}`} className="whitespace-pre-wrap break-all bg-red-50 px-3 text-red-800">
              <span className="select-none text-red-400">− </span>
              {l}
            </div>
          ))}
          {cur.result.diff.added.map((l, i) => (
            <div key={`a${i}`} className="whitespace-pre-wrap break-all bg-green-50 px-3 text-green-800">
              <span className="select-none text-green-500">+ </span>
              {l}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-w-0 flex-1 place-items-center p-6 text-center">
          <div>
            <LuFileCode className="mx-auto size-10 text-brand-500" />
            <p className="mt-3 font-mono text-sm font-bold">{cur.detail ?? toolName(cur.tool)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {stepVerb(cur)}
              {cur.result?.summary && ` · ${cur.result.summary}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Búsqueda: la consulta arriba y lo que encontró, como lista de resultados. */
function SearchView(p: ViewProps) {
  const items = p.step.result?.items;
  if (!items?.length) return <GenericView {...p} />;
  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1.5 text-sm shadow-[2px_2px_0_0_#000]">
        <LuSearch className="size-4 shrink-0 text-brand-500" />
        <span className="min-w-0 truncate font-bold">{p.step.detail ?? stepVerb(p.step)}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <motion.li
            key={it.url ?? it.path ?? i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-lg border-2 border-black bg-white px-3 py-2"
          >
            {it.url ? (
              <a href={it.url} target="_blank" rel="noreferrer noopener" className="block min-w-0 hover:underline">
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <img src={`https://icons.duckduckgo.com/ip3/${hostOf(it.url)}.ico`} alt="" className="size-3.5" loading="lazy" />
                  {hostOf(it.url)}
                </span>
                <span className="mt-0.5 block truncate text-sm font-bold">{it.title}</span>
              </a>
            ) : (
              <span className="block truncate font-mono text-xs">{it.path}</span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function GenericView({ step, running }: ViewProps) {
  const Icon = ICON[step.kind];
  return (
    <div className="grid h-full place-items-center overflow-auto p-6 text-center">
      <div className="min-w-0 max-w-full">
        <Icon className={`mx-auto size-10 text-brand-500 ${running ? "animate-pulse" : ""}`} />
        <p className="mt-3 text-sm font-bold">{stepVerb(step)}</p>
        {step.detail && <p className="mx-auto mt-1 max-w-xs break-words font-mono text-xs text-gray-500">{step.detail}</p>}
        {step.result?.summary && (
          <pre className="mx-auto mt-3 max-h-64 max-w-md overflow-auto whitespace-pre-wrap break-words rounded-lg border-2 border-black bg-white p-3 text-left font-mono text-[11px] text-gray-700">
            {step.result.summary}
          </pre>
        )}
      </div>
    </div>
  );
}

function EmptyComputer({ owner, live }: { owner: string; live: boolean }) {
  return (
    <div className="grid h-full place-items-center bg-white p-6 text-center">
      <div>
        <img src="/icons/escribenos.svg" alt="" className={`mx-auto h-14 ${live ? "animate-bounce" : ""}`} />
        <p className="mt-3 text-sm font-bold">La computadora {owner}</p>
        <p className="mt-1 text-xs text-gray-500">{live ? "En cuanto use una herramienta la verás aquí." : "Este turno no usó herramientas."}</p>
      </div>
    </div>
  );
}

/**
 * La persona maneja la pestaña: la recibe en vivo (screencast) y sus clics, teclas y rueda van a
 * la caja. Mientras dure, el agente no puede actuar en ese navegador y nada de esto se guarda en
 * el replay (como ChatGPT: lo que escribe la persona no queda en capturas).
 */
function TakeoverView({ urls, onDone }: { urls: TakeoverUrls; onDone: () => void }) {
  const { frame, gone: streamGone } = useScreencast(urls.liveUrl);
  const [inputGone, setGone] = useState(false);
  const gone = streamGone || inputGone;
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, [urls.liveUrl]);

  const send = (ev: Record<string, unknown>) =>
    fetch(urls.inputUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev) }).catch(() => setGone(true));

  const release = async () => {
    await fetch(urls.releaseUrl, { method: "POST" }).catch(() => {});
    onDone();
  };

  // px de la imagen → px del viewport de la página.
  const toPage = (clientX: number, clientY: number) => {
    const r = imgRef.current!.getBoundingClientRect();
    const vw = urls.viewport?.width ?? imgRef.current!.naturalWidth;
    const k = vw / r.width;
    return { x: Math.round((clientX - r.left) * k), y: Math.round((clientY - r.top) * k) };
  };

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        if (e.key.length === 1) void send({ type: "type", text: e.key });
        else if (["Enter", "Backspace", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete"].includes(e.key)) void send({ type: "key", key: e.key });
      }}
      onWheel={(e) => void send({ type: "scroll", dy: Math.round(e.deltaY) })}
      className="flex h-full flex-col p-3 outline-none"
    >
      <div className="mb-2 flex items-center gap-2 rounded-lg border-2 border-black bg-amber-100 px-3 py-1.5 text-xs">
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-bold">Tienes el control.</span> El agente espera; esto no se guarda en el replay. {frame?.url && <span className="font-mono text-gray-500">{frame.url}</span>}
        </span>
        <button type="button" onClick={release} className="shrink-0 rounded-md border-2 border-black bg-white px-2 py-0.5 font-bold hover:bg-brand-500/15">
          Devolver el control
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-black bg-white">
        {gone ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-gray-500">
            Se cerró el navegador (expiró o terminó el turno).
            <button type="button" onClick={onDone} className="mt-2 underline">Volver</button>
          </div>
        ) : frame ? (
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${frame.data}`}
            alt="Navegador del agente en vivo"
            draggable={false}
            onClick={(e) => void send({ type: "click", ...toPage(e.clientX, e.clientY) })}
            className="block w-full cursor-pointer select-none"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-gray-400">Conectando con el navegador…</div>
        )}
      </div>
    </div>
  );
}
