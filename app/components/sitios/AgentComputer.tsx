import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuFileCode, LuGlobe, LuPause, LuPlay, LuSearch, LuTerminal, LuWrench } from "react-icons/lu";
import { KIND_LABEL, stepVerb, type AgentStep, type StepKind } from "~/lib/agentSteps";

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

export type TakeoverUrls = { liveUrl: string; inputUrl: string; releaseUrl: string; viewport: { width: number; height: number } | null };

export function AgentComputer({
  steps,
  live,
  agentName,
  autoplay = false,
  onTakeover,
}: {
  steps: AgentStep[];
  live: boolean;
  agentName?: string;
  autoplay?: boolean;
  /** «Tomar el control» del navegador; sin esto el botón no aparece (replay, otras superficies). */
  onTakeover?: (sessionId: string) => Promise<TakeoverUrls>;
}) {
  const [takeover, setTakeover] = useState<TakeoverUrls | null>(null);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const owner = agentName ? `de ${agentName}` : "del agente";
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
  const following = pinned === null;

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
                stale={stale}
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
            ) : step.kind === "terminal" ? (
              <TerminalView steps={steps} idx={idx} running={running} />
            ) : step.kind === "editor" ? (
              <EditorView steps={steps} idx={idx} />
            ) : (
              <GenericView step={step} running={running} />
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
            {step.detail && <span className="text-gray-500"> · {step.detail}</span>}
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
function BrowserView({ step, stale, onTakeover, error }: { step: AgentStep; stale?: boolean; onTakeover?: () => void; error?: string | null }) {
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
            {f?.url ?? step.detail ?? "abriendo…"}
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          {f ? (
            <div className="relative">
              <img ref={imgRef} src={f.image} alt={f.title || "Página que ve el agente"} className={`block w-full ${stale ? "opacity-50" : ""}`} />
              {f.target && scale > 0 && (
                <motion.span
                  key={f.image}
                  initial={{ opacity: 0, scale: 1.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
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

/** Nombre de la herramienta sin el prefijo del MCP: `sandbox_files_edit`, no `mcp__easybits__sandbox_files_edit`. */
const toolName = (t: string) => t.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");

/** Terminal: todos los comandos del turno hasta el paso elegido; el actual resaltado. */
function TerminalView({ steps, idx, running }: { steps: AgentStep[]; idx: number; running: boolean }) {
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
          <div className={s.status === "error" ? "text-red-400" : "text-gray-500"}>
            {i === idx && running ? <span className="animate-pulse">▍</span> : s.status === "error" ? "✗ terminó con error" : "✓ listo"}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

/** Editor: los archivos que tocó el turno (árbol plano) y el actual al frente. */
function EditorView({ steps, idx }: { steps: AgentStep[]; idx: number }) {
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
      <div className="grid min-w-0 flex-1 place-items-center p-6 text-center">
        <div>
          <LuFileCode className="mx-auto size-10 text-brand-500" />
          <p className="mt-3 font-mono text-sm font-bold">{cur.detail ?? toolName(cur.tool)}</p>
          <p className="mt-1 text-xs text-gray-500">{stepVerb(cur)}</p>
        </div>
      </div>
    </div>
  );
}

function GenericView({ step, running }: { step: AgentStep; running: boolean }) {
  const Icon = ICON[step.kind];
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <Icon className={`mx-auto size-10 text-brand-500 ${running ? "animate-pulse" : ""}`} />
        <p className="mt-3 text-sm font-bold">{stepVerb(step)}</p>
        {step.detail && <p className="mt-1 max-w-xs break-words font-mono text-xs text-gray-500">{step.detail}</p>}
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
  const [frame, setFrame] = useState<{ data: string; url: string } | null>(null);
  const [gone, setGone] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(urls.liveUrl);
    es.onmessage = (e) => {
      try {
        setFrame(JSON.parse(e.data));
      } catch {
        /* frame malformado */
      }
    };
    es.onerror = () => setGone(true);
    boxRef.current?.focus();
    return () => es.close();
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
