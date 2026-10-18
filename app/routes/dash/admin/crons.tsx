import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { data, redirect, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { getUserOrRedirect, isAdminUser } from "~/.server/getters";
import { CronRunError, listCronOverview, setCronPaused, startManualRun } from "~/.server/cron";
import type { CronOverview, CronRunView } from "~/.server/cron";
import { BrutalButton } from "~/components/common/BrutalButton";
import { SKILLS_ADD_CMD } from "~/components/docs/SkillsInstall";
import type { Route } from "./+types/crons";

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
  nuevo: { label: "sin corridas", dot: "bg-white" },
};

function runTitle(r: CronRunView) {
  const state = r.running ? "corriendo" : r.ok ? "ok" : "falló";
  return `${stamp(r.startedAt)} · ${duration(r.durationMs)} · ${r.status ?? "—"} ${state} · ${TRIGGER_LABEL[r.trigger] ?? r.trigger}`;
}

function RunSquares({ runs: all, max = 20 }: { runs: CronRunView[]; max?: number }) {
  const runs = all.slice(-max);
  const empty = Math.max(0, max - runs.length);
  return (
    <div className="flex gap-[3px]" aria-label={`Últimas ${runs.length} corridas`}>
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
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Corridas de ${job.name}`}>
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
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Últimas 50 corridas</h4>
        {!items && <p className="text-sm text-gray-500">Cargando…</p>}
        {items && items.length === 0 && <p className="text-sm text-gray-500">Todavía no hay corridas registradas.</p>}
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
                <span className="text-gray-500">{r.running ? "corriendo" : duration(r.durationMs)}</span>
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
  onOpen,
  onAsk,
}: {
  job: CronOverview;
  now: number;
  /** Tabla angosta (el copiloto abierto o una pantalla chica): tres columnas, sin ruta ni Pausar. */
  compact: boolean;
  onOpen: () => void;
  onAsk: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const pending = fetcher.formData?.get("intent");
  const st = STATUS[job.status];
  const last = job.lastRun;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const stateLabel = job.running ? "corriendo" : st.label;
  const dot = <span className={`w-3 h-3 shrink-0 rounded-full border-2 border-black ${st.dot}`} />;

  const actions = (
    <td className="p-3 text-right whitespace-nowrap" onClick={stop} onKeyDown={stop}>
      <fetcher.Form method="post" className="inline-flex gap-2">
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
        {!compact && (
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
        )}
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
        <td className="p-3">
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
        <td className="p-3">
          <RunSquares runs={job.recent} max={10} />
        </td>
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
        <p className="font-bold leading-tight">{job.name}</p>
        <p className="font-mono text-xs text-gray-400">{job.path}</p>
      </td>
      <td className="p-3 text-sm whitespace-nowrap">{job.schedule}</td>
      <td className="p-3">
        <RunSquares runs={job.recent} />
      </td>
      <td className="p-3 text-sm whitespace-nowrap" suppressHydrationWarning>
        {last ? (
          <>
            {relative(last.startedAt, now)}
            <span className="block text-xs text-gray-500">{last.running ? "corriendo" : duration(last.durationMs)}</span>
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
  const [compact, setCompact] = useState(false);
  const needed = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => {
      const avail = el.clientWidth;
      const t = table.current;
      if (!compact && t && t.scrollWidth > avail + 1) {
        needed.current = t.scrollWidth;
        setCompact(true);
      } else if (compact && needed.current && avail >= needed.current) {
        setCompact(false);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);
  return { box, table, compact };
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

  // Sondeo cada 5 s sólo mientras haya una corrida en curso.
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 5000);
    return () => clearInterval(id);
  }, [anyRunning, revalidator]);

  const open = jobs.find((j) => j.key === openKey) ?? null;
  const { box, table, compact } = useCompactTable();

  // Copiloto: se monta al abrirlo por primera vez y queda vivo (el hilo no se pierde al cerrar).
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMounted, setCopilotMounted] = useState(false);
  const [copilotJobKey, setCopilotJobKey] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const copilotJob = jobs.find((j) => j.key === copilotJobKey) ?? null;

  const openCopilot = () => {
    setCopilotMounted(true);
    setCopilotOpen(true);
  };
  const closeCopilot = useCallback(() => setCopilotOpen(false), []);
  const refresh = useCallback(() => {
    if (revalidator.state === "idle") revalidator.revalidate();
  }, [revalidator]);
  const askAbout = (job: CronOverview) => {
    setCopilotJobKey(job.key);
    setAsk((a) => ({ text: `¿Por qué falló «${job.name}» en su última corrida y qué hago para arreglarlo?`, key: (a?.key ?? 0) + 1 }));
    openCopilot();
  };

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 max-w-6xl flex-1 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black mb-1">Crons</h2>
            <p className="text-sm text-gray-500">
              Tareas programadas de la plataforma. El horario vive en el código (app/lib/cronJobs.ts) y cambia con un deploy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CopySkillsCommand />
            {!copilotOpen && (
              <BrutalButton type="button" mode="brand" onClick={openCopilot}>
                Copiloto
              </BrutalButton>
            )}
          </div>
        </div>
        <div ref={box} className="border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0_#000]">
          <table ref={table} className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {(compact
                  ? ["Tarea", "Últimas corridas", ""]
                  : ["Estado", "Tarea", "Horario", "Últimas corridas", "Última", "Próxima", ""]
                ).map((h, i) => (
                  <th key={i} className="p-3 text-left font-bold text-xs uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow key={job.key} job={job} now={now} compact={compact} onOpen={() => setOpenKey(job.key)} onAsk={() => askAbout(job)} />
              ))}
            </tbody>
          </table>
        </div>
        {open && <RunsDrawer job={open} running={open.running} onClose={() => setOpenKey(null)} />}
      </div>
      {copilotMounted && (
        <div className={copilotOpen ? "contents" : "hidden"}>
          <Suspense fallback={null}>
            <CronsCopilot
              ask={ask}
              job={copilotJob ? { key: copilotJob.key, name: copilotJob.name } : null}
              onClearJob={() => setCopilotJobKey(null)}
              onClose={closeCopilot}
              escBlocked={!copilotOpen || open != null}
              onChange={refresh}
            />
          </Suspense>
        </div>
      )}
    </div>
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
