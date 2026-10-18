import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { data, redirect, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { Group, Panel, Separator, usePanelRef, type LayoutChangedMeta } from "react-resizable-panels";
import { Drawer } from "vaul";
import { getUserOrRedirect, isAdminUser } from "~/.server/getters";
import { CronRunError, listCronOverview, setCronPaused, startManualRun } from "~/.server/cron";
import type { CronOverview, CronRunView } from "~/.server/cron";
import { BrutalButton } from "~/components/common/BrutalButton";
import { SKILLS_ADD_CMD } from "~/components/docs/SkillsInstall";
import { UserCronsSection } from "~/components/admin/UserCronsSection";
import type { Route } from "./+types/crons";
import "./crons.css";

// El copiloto (y su CSS) sólo se baja cuando se abre.
const CronsCopilot = lazy(() => import("~/components/admin/CronsCopilot").then((m) => ({ default: m.CronsCopilot })));

export const meta = () => [
  { title: "Crons — Admin — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  if (!isAdminUser(user)) return redirect("/dash");
  return data({ jobs: await listCronOverview(), now: new Date().toISOString() });
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  if (!isAdminUser(user)) return redirect("/dash");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const job = String(form.get("job") || "");
  try {
    if (intent === "run") return data({ ok: true, ...(await startManualRun(job)) });
    if (intent === "pause" || intent === "resume") {
      await setCronPaused(job, intent === "pause", user.email);
      return data({ ok: true });
    }
  } catch (e) {
    if (e instanceof CronRunError) return data({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
  return data({ ok: false, error: "Acción desconocida" }, { status: 400 });
};

// ── Formato ──────────────────────────────────────────────────────────────────────
function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

function relative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  let txt: string;
  if (abs < 60_000) txt = "unos segundos";
  else if (min < 60) txt = `${min} min`;
  else if (min < 48 * 60) txt = `${Math.round(min / 60)} h`;
  else txt = `${Math.round(min / 1440)} d`;
  return diff < 0 ? `hace ${txt}` : `en ${txt}`;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";

const TRIGGER_LABEL: Record<string, string> = { restate: "Restate", github: "GitHub", manual: "manual" };

const STATUS: Record<CronOverview["status"], { label: string; dot: string }> = {
  "al-dia": { label: "al día", dot: "bg-green-500" },
  tarde: { label: "tarde", dot: "bg-amber-400" },
  fallo: { label: "falló", dot: "bg-red-500" },
  pausado: { label: "pausado", dot: "bg-gray-400" },
  nuevo: { label: "sin ejecuciones", dot: "bg-white" },
};

function runTitle(r: CronRunView) {
  const state = r.running ? "en ejecución" : r.ok ? "ok" : "falló";
  return `${stamp(r.startedAt)} · ${duration(r.durationMs)} · ${r.status ?? "—"} ${state} · ${TRIGGER_LABEL[r.trigger] ?? r.trigger}`;
}

function RunSquares({ runs: all, max = 20 }: { runs: CronRunView[]; max?: number }) {
  const runs = all.slice(-max);
  const empty = Math.max(0, max - runs.length);
  return (
    <div className="flex gap-[3px]" aria-label={`Últimas ${runs.length} ejecuciones`}>
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="w-2.5 h-4 rounded-[2px] border border-gray-200" />
      ))}
      {runs.map((r) => (
        <span
          key={r.id}
          title={runTitle(r)}
          className={`w-2.5 h-4 rounded-[2px] border border-black ${
            r.running ? "bg-gray-300 animate-pulse" : r.ok ? "bg-green-500" : "bg-red-500"
          }`}
        />
      ))}
    </div>
  );
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9870ED]";

// ── Panel lateral ────────────────────────────────────────────────────────────────
function RunsDrawer({ job, running, onClose }: { job: CronOverview; running: boolean; onClose: () => void }) {
  const runs = useFetcher<{ items: CronRunView[] }>();
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = `/api/v2/admin/crons/${job.key}/runs`;

  useEffect(() => {
    closeRef.current?.focus();
  }, [url]);

  // Carga al abrir y, mientras corra, se refresca con el mismo ritmo que la tabla.
  useEffect(() => {
    runs.load(url);
    if (!running) return;
    const id = setInterval(() => runs.load(url), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = runs.data?.items;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ejecuciones de ${job.name}`}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30 cursor-default" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl bg-white border-l-2 border-black overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h3 className="text-xl font-black">{job.name}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`text-sm font-bold border-2 border-black rounded-lg px-2 py-0.5 hover:bg-gray-100 ${focusRing}`}
          >
            Cerrar
          </button>
        </div>
        <p className="font-mono text-xs text-gray-500 mb-1">{job.path}</p>
        <p className="text-sm text-gray-600 mb-6">
          {job.schedule} · <span className="font-mono">{job.cron}</span>
        </p>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Últimas 50 ejecuciones</h4>
        {!items && <p className="text-sm text-gray-500">Cargando…</p>}
        {items && items.length === 0 && <p className="text-sm text-gray-500">Todavía no hay ejecuciones registradas.</p>}
        <ol className="space-y-2">
          {items?.map((r) => (
            <li key={r.id} className="border-2 border-black rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`w-2.5 h-2.5 rounded-full border border-black ${
                    r.running ? "bg-gray-300 animate-pulse" : r.ok ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="font-bold">{stamp(r.startedAt)}</span>
                <span className="text-gray-500">{r.running ? "en ejecución" : duration(r.durationMs)}</span>
                {r.status != null && <span className="text-gray-500">· {r.status}</span>}
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100">
                  {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                </span>
              </div>
              {r.summary && <p className="mt-1 font-mono text-xs text-gray-600 break-all">{r.summary}</p>}
              {r.error && (
                <pre className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                  {r.error}
                </pre>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

// ── Fila ─────────────────────────────────────────────────────────────────────────
function JobRow({
  job,
  now,
  compact,
  tight,
  onOpen,
  onAsk,
}: {
  job: CronOverview;
  now: number;
  /** Tabla angosta (el copiloto abierto o una pantalla chica): tres columnas, sin ruta ni Pausar. */
  compact: boolean;
  /** Ni así cabe: sin ejecuciones, y las acciones pueden ir en dos renglones. */
  tight: boolean;
  onOpen: () => void;
  onAsk: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const pending = fetcher.formData?.get("intent");
  const st = STATUS[job.status];
  const last = job.lastRun;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const stateLabel = job.running ? "en ejecución" : st.label;
  const dot = <span className={`w-3 h-3 shrink-0 rounded-full border-2 border-black ${st.dot}`} />;

  const actions = (
    <td className={`p-3 text-right ${tight ? "" : "whitespace-nowrap"}`} onClick={stop} onKeyDown={stop}>
      <fetcher.Form method="post" className={`inline-flex justify-end gap-2 ${tight ? "flex-wrap" : ""}`}>
        <input type="hidden" name="job" value={job.key} />
        {job.status === "fallo" && (
          <BrutalButton type="button" size="chip" mode="brand" onClick={onAsk}>
            Pídeselo
          </BrutalButton>
        )}
        <BrutalButton
          type="submit"
          size="chip"
          mode="ghost"
          name="intent"
          value="run"
          isDisabled={busy || job.running || job.paused}
        >
          {pending === "run" ? "…" : compact ? "Ejecutar" : "Ejecutar ahora"}
        </BrutalButton>
        <BrutalButton
          type="submit"
          size="chip"
          mode={job.paused ? "brand" : "ghost"}
          name="intent"
          value={job.paused ? "resume" : "pause"}
          isDisabled={busy}
        >
          {job.paused ? "Reanudar" : "Pausar"}
        </BrutalButton>
      </fetcher.Form>
      {fetcher.data?.error && <p className="mt-1 text-xs font-bold text-red-600 whitespace-normal">{fetcher.data.error}</p>}
    </td>
  );

  const rowProps = {
    className: `border-t border-gray-200 hover:bg-gray-50 cursor-pointer ${focusRing}`,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && onOpen(),
    tabIndex: 0,
  };

  if (compact) {
    return (
      <tr {...rowProps}>
        <td className="w-full p-3">
          <p className="flex items-center gap-2 font-bold leading-tight" title={stateLabel}>
            {dot}
            <span>{job.name}</span>
            <span className="sr-only">· {stateLabel}</span>
          </p>
          <p className="mt-1 pl-5 text-xs text-gray-500" suppressHydrationWarning>
            {job.schedule} · última {last ? relative(last.startedAt, now) : "—"} · próxima{" "}
            {job.paused ? "en pausa" : relative(job.nextRunAt, now)}
          </p>
        </td>
        {!tight && (
          <td className="w-px p-3">
            <RunSquares runs={job.recent} max={10} />
          </td>
        )}
        {actions}
      </tr>
    );
  }

  return (
    <tr {...rowProps}>
      <td className="p-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          {dot}
          <span className="text-xs font-bold">{stateLabel}</span>
        </span>
      </td>
      <td className="p-3">
        {/* Un nombre o ruta larga no ensancha la tabla: se corta y queda completo en el title. */}
        <p className="max-w-[15rem] truncate font-bold leading-tight" title={job.name}>
          {job.name}
        </p>
        <p className="max-w-[15rem] truncate font-mono text-xs text-gray-500" title={job.path}>
          {job.path}
        </p>
      </td>
      <td className="p-3 text-sm whitespace-nowrap">{job.schedule}</td>
      <td className="p-3">
        <RunSquares runs={job.recent} />
      </td>
      <td className="p-3 text-sm whitespace-nowrap" suppressHydrationWarning>
        {last ? (
          <>
            {relative(last.startedAt, now)}
            <span className="block text-xs text-gray-500">{last.running ? "en ejecución" : duration(last.durationMs)}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="p-3 text-sm whitespace-nowrap" suppressHydrationWarning>
        {job.paused ? "—" : relative(job.nextRunAt, now)}
      </td>
      {actions}
    </tr>
  );
}

/**
 * ¿Cabe la tabla completa? Se mide de verdad: si la tabla completa no cabe en su contenedor se
 * pasa a la compacta, y vuelve a la completa cuando el contenedor alcanza el ancho que necesitaba.
 * Nunca hay scroll horizontal.
 */
function useCompactTable() {
  const box = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  // 0 = completa · 1 = compacta · 2 = compacta sin ejecuciones (y las acciones pueden ir en dos renglones).
  const [level, setLevel] = useState(0);
  // Hasta la primera medida la tabla no se pinta: el HTML del servidor no sabe el ancho y saldría cortada.
  const [measured, setMeasured] = useState(false);
  const needed = useRef<number[]>([]);
  // Antes de pintar (y en cada cambio de tamaño, también de la tabla cuando llega la fuente).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => {
      const avail = el.clientWidth;
      const t = table.current;
      if (level < 2 && t && t.scrollWidth > avail + 1) {
        needed.current[level] = t.scrollWidth;
        setLevel(level + 1);
      } else if (level > 0 && needed.current[level - 1] && avail >= needed.current[level - 1]) {
        setLevel(level - 1);
      } else {
        setMeasured(true);
      }
    };
    check();
    // También la tabla: si cambia su contenido o llega la fuente, crece sin que cambie el contenedor.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (table.current) ro.observe(table.current);
    return () => ro.disconnect();
  }, [level]);
  return { box, table, compact: level > 0, tight: level > 1, measured };
}

export default function CronsAdmin() {
  const { jobs, now: serverNow } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const anyRunning = jobs.some((j) => j.running);

  // Reloj para «hace…/en…» sin pedir nada al servidor.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [serverNow]);

  // Sondeo: cada 5 s mientras haya una ejecución en curso; si no, cada minuto (el estado «al día /
  // tarde» lo calcula el servidor y una pestaña abierta no debe quedarse con el de cuando cargó).
  useEffect(() => {
    const id = setInterval(
      () => {
        if (revalidator.state === "idle" && document.visibilityState === "visible") revalidator.revalidate();
      },
      anyRunning ? 5000 : 60_000
    );
    return () => clearInterval(id);
  }, [anyRunning, revalidator]);

  const open = jobs.find((j) => j.key === openKey) ?? null;
  const { box, table, compact, tight, measured } = useCompactTable();

  // Copiloto: se monta al abrirlo por primera vez y queda vivo (el hilo no se pierde al cerrar).
  // Escritorio: panel redimensionable que EMPUJA la tabla. Móvil: hoja de vaul desde abajo.
  const isDesktop = useIsDesktop();
  const copilotPanel = usePanelRef();
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
  const [copilotMounted, setCopilotMounted] = useState(false);
  const [copilotJobKey, setCopilotJobKey] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const copilotJob = jobs.find((j) => j.key === copilotJobKey) ?? null;
  const copilotOpen = isDesktop ? panelOpen : sheetOpen;

  // Al pasar a móvil con el panel abierto, se cierra el panel y sigue en la hoja.
  useEffect(() => {
    const panel = copilotPanel.current;
    if (isDesktop || !panel || panel.isCollapsed()) return;
    panel.collapse();
    setSheetOpen(true);
  }, [isDesktop, copilotPanel]);

  const openCopilot = () => {
    setCopilotMounted(true);
    if (!isDesktop) return setSheetOpen(true);
    const panel = copilotPanel.current;
    if (!panel || !panel.isCollapsed()) return;
    panel.expand();
    panel.resize(`${readCopilotWidth()}px`);
  };
  const closeCopilot = useCallback(() => {
    copilotPanel.current?.collapse();
    setSheetOpen(false);
  }, [copilotPanel]);
  // El ancho que el usuario eligió arrastrando se recuerda (sólo el ancho: siempre arranca cerrado).
  const onLayoutChanged = (_: unknown, meta: LayoutChangedMeta) => {
    const px = copilotPanel.current?.getSize().inPixels ?? 0;
    if (meta.isUserInteraction && px > 0) writeCopilotWidth(px);
  };
  const refresh = useCallback(() => {
    if (revalidator.state === "idle") revalidator.revalidate();
  }, [revalidator]);
  const askAbout = (job: CronOverview) => {
    setCopilotJobKey(job.key);
    setAsk((a) => ({
      text: `¿Por qué falló «${job.name}» en su última ejecución y qué hago para arreglarlo?`,
      key: (a?.key ?? 0) + 1,
    }));
    openCopilot();
  };

  const copilot = (variant: "panel" | "sheet") => (
    <Suspense fallback={null}>
      <CronsCopilot
        variant={variant}
        ask={ask}
        job={copilotJob ? { key: copilotJob.key, name: copilotJob.name } : null}
        onClearJob={() => setCopilotJobKey(null)}
        onClose={closeCopilot}
        escBlocked={!copilotOpen || open != null}
        onChange={refresh}
      />
    </Suspense>
  );

  return (
    <>
      {/* El copiloto llega hasta el borde de la ventana (el layout de admin tiene px-8). */}
      <div className="md:-mr-8">
        <Group id="crons-layout" style={{ overflow: "clip" }} onLayoutChanged={onLayoutChanged}>
          <Panel id="crons-table" minSize={isDesktop ? 420 : 0} style={{ overflow: "clip", minWidth: 0 }}>
            <div className="min-w-0 max-w-[90rem] pb-10 pr-2">
              {/* Encabezado fijo: la caja del comando no cambia de lugar al abrir o cerrar el copiloto. */}
              <div className="mb-6">
                <h2 className="text-2xl font-black mb-1">Crons</h2>
                <p className="text-sm text-gray-500">
                  Tareas programadas de la plataforma. El horario vive en el código (app/lib/cronJobs.ts) y cambia con un
                  deploy.
                </p>
                <div className="mt-4 flex flex-wrap items-stretch gap-3">
                  <CopySkillsCommand />
                  {!copilotOpen && (
                    <BrutalButton type="button" mode="brand" onClick={openCopilot}>
                      <span className="inline-flex items-center gap-2">
                        <SparkIcon />
                        Piloto
                      </span>
                    </BrutalButton>
                  )}
                </div>
              </div>
              <div ref={box} className="border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0_#000]">
                <table ref={table} className={`w-full text-sm ${measured ? "" : "invisible"}`}>
                  <thead className="bg-gray-100">
                    <tr>
                      {(compact
                        ? ["Tarea", "Ejecuciones", ""]
                        : ["Estado", "Tarea", "Horario", "Últimas ejecuciones", "Última", "Próxima", ""]
                      ).map((h, i) => (
                        <th
                          key={i}
                          className={`p-3 text-left font-bold text-xs uppercase ${tight && i === 1 ? "hidden" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <JobRow
                        key={job.key}
                        job={job}
                        now={now}
                        compact={compact}
                        tight={tight}
                        onOpen={() => setOpenKey(job.key)}
                        onAsk={() => askAbout(job)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {open && <RunsDrawer job={open} running={open.running} onClose={() => setOpenKey(null)} />}
              <UserCronsSection />
            </div>
          </Panel>
          <Separator
            className={`crons-separator max-lg:hidden ${panelOpen ? "" : "invisible"}`}
            aria-label="Cambiar el ancho del piloto"
          />
          <Panel
            id="crons-copilot"
            panelRef={copilotPanel}
            collapsible
            collapsedSize={0}
            defaultSize={0}
            minSize={320}
            maxSize="60%"
            style={{ overflow: "clip", minWidth: 0 }}
            onResize={(size) => setPanelOpen(size.inPixels > 0)}
          >
            {/* Cerrado sigue montado (el hilo no se pierde), pero fuera del foco y del lector de pantalla. */}
            {copilotMounted && isDesktop && (
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
              <Drawer.Title className="sr-only">Piloto de crons</Drawer.Title>
              {/* vaul desplaza la hoja: el chat mide lo VISIBLE en cada punto, para que el composer no quede abajo de la pantalla. */}
              <div
                ref={sheetChat}
                className="min-h-0"
                style={{ height: sheetChatH ? `${sheetChatH}px` : `calc(${Math.round(sheetSnap * 100)}dvh - 3rem)` }}
              >
                {copilotMounted && copilot("sheet")}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}

// ── Copiloto: tamaño y punto de quiebre ──────────────────────────────────────────
const COPILOT_WIDTH_KEY = "eb:crons-copilot-width";
/** Hoja móvil: a media pantalla (se ve la tabla) o casi completa. */
const SHEET_SNAPS = [0.6, 0.94];

function readCopilotWidth(): number {
  try {
    const n = Number(localStorage.getItem(COPILOT_WIDTH_KEY));
    if (n >= 320) return n;
  } catch {
    /* sin almacenamiento: ancho por defecto */
  }
  return 420;
}

function writeCopilotWidth(px: number) {
  try {
    localStorage.setItem(COPILOT_WIDTH_KEY, String(Math.round(px)));
  } catch {
    /* sin almacenamiento */
  }
}

/** `lg` de Tailwind: panel lateral desde 1024 px, hoja de vaul debajo. En el servidor, escritorio. */
function useIsDesktop() {
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

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
    </svg>
  );
}

/** Tu agente opera estos crons por la API de admin: instala los skills de EasyBits con un comando. */
function CopySkillsCommand() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SKILLS_ADD_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles (http o permisos): el comando sigue a la vista */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copia el comando para instalar los skills de EasyBits en tu agente"
      className="flex items-center gap-3 rounded-xl border-2 border-black bg-white px-3 py-2 text-left shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
    >
      <code className="font-mono text-xs">{SKILLS_ADD_CMD}</code>
      <span className="rounded-lg bg-black px-2 py-1 text-[11px] font-bold text-white">{copied ? "✓ Copiado" : "Copiar"}</span>
    </button>
  );
}
