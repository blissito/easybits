import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";

// «Mis crons»: los crons de la cuenta de quien mira (userCronOperations.ts). Habla directo con
// la REST /api/v2/crons (la sesión del panel vale como auth), así que lo que se hace aquí es
// exactamente lo que hace un agente por API/MCP. Vive en /dash/developer/crons (todos) y en
// /dash/admin/crons (junto al copiloto).

type Action =
  | { type: "http"; url: string; method: string; body?: string; secretName?: string; secretHeader?: string }
  | { type: "agent_turn"; fleetAgentId: string; prompt: string; groupId?: string }
  | {
      type: "exec";
      command: string;
      template?: string;
      timeoutSeconds?: number;
      files?: { path: string }[];
      secrets?: { name: string; file?: string }[];
    };

type Notify = { on: "failure" | "always"; push?: unknown; email?: true; inbox?: string };

type UserCron = {
  id: string;
  name: string;
  kind: "once" | "recurring";
  cron: string;
  at: string | null;
  until: string | null;
  timesLeft: number | null;
  timezone: string;
  schedule: string;
  enabled: boolean;
  done?: boolean;
  action: Action;
  notify: Notify | null;
  nextRunAt: string | null;
  nextRunLocal: string | null;
  in: string | null;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
  failCount: number;
};
type Agent = { id: string; name: string };
type Run = {
  id: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  status: number | null;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
  exitCode: number | null;
  logs?: string | null;
  running: boolean;
};

const DEFAULT_TZ = "America/Mexico_City";
const TEMPLATES = ["python", "node", "bun", "ubuntu"] as const;
const DAYS = [
  ["1", "lunes"],
  ["2", "martes"],
  ["3", "miércoles"],
  ["4", "jueves"],
  ["5", "viernes"],
  ["6", "sábado"],
  ["0", "domingo"],
] as const;

type When = { mode: "once" | "daily" | "weekdays" | "weekly" | "every" | "custom"; time: string; day: string; every: string; cron: string; at: string };
type Ends = { mode: "never" | "times" | "until"; times: string; until: string };

/** Lo que el usuario eligió en palabras → cron de 5 campos. */
function toCron(w: When): string {
  const [h, m] = (w.time || "08:30").split(":").map((n) => String(Number(n)));
  if (w.mode === "daily") return `${m} ${h} * * *`;
  if (w.mode === "weekdays") return `${m} ${h} * * 1-5`;
  if (w.mode === "weekly") return `${m} ${h} * * ${w.day}`;
  if (w.mode === "every") return w.every === "60" ? "0 * * * *" : `*/${w.every} * * * *`;
  return w.cron.trim();
}

/** Un ISO → «YYYY-MM-DDTHH:mm» en la zona del cron (lo que espera un input datetime-local). */
function toLocalInput(iso: string, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  // El reloj del navegador y el del servidor difieren unos segundos: menos de un minuto es «ahora».
  if (min < 1) return "justo ahora";
  const txt = min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
  return diff >= 0 ? `en ${txt}` : `hace ${txt}`;
}

function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error === "needs_confirmation" ? json.message : json.message || json.error || `HTTP ${res.status}`);
  return json;
}

const input = "w-full rounded-lg border-2 border-black px-3 py-2 text-sm";
const label = "block text-xs font-bold uppercase mb-1";

export function UserCronsSection() {
  const [items, setItems] = useState<UserCron[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Fila abierta: su historial o su formulario de edición.
  const [open, setOpen] = useState<{ id: string; what: "runs" | "edit" } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api("/api/v2/crons?include=agents");
      setItems(r.items);
      setAgents(r.agents ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // El copiloto revalida la ruta al aprobar una tarjeta: también recargamos aquí.
  const revalidator = useRevalidator();
  const prev = useRef(revalidator.state);
  useEffect(() => {
    if (prev.current === "loading" && revalidator.state === "idle") load();
    prev.current = revalidator.state;
  }, [revalidator.state, load]);

  const toggle = (id: string, what: "runs" | "edit") => setOpen((o) => (o?.id === id && o.what === what ? null : { id, what }));

  const act = async (id: string, what: "run" | "pause" | "resume" | "delete") => {
    if (what === "delete" && !confirm("¿Borrar este cron?")) return;
    setBusy(`${id}:${what}`);
    setError(null);
    try {
      if (what === "run") await api(`/api/v2/crons/${id}/run`, { method: "POST" });
      if (what === "delete") await api(`/api/v2/crons/${id}`, { method: "DELETE" });
      if (what === "pause" || what === "resume") {
        await api(`/api/v2/crons/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: what === "resume" }) });
      }
      // «Ejecutar» corre en segundo plano: un segundo después ya hay resultado casi siempre.
      if (what === "run") await new Promise((r) => setTimeout(r, 1500));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-black mb-1">Mis crons</h3>
          <p className="text-sm text-gray-500">
            Tareas programadas de tu cuenta: le pegan a una URL, le mandan un mensaje a uno de tus agentes o corren un comando en
            una caja. También por API (<code className="font-mono text-xs">/api/v2/crons</code>), MCP (
            <code className="font-mono text-xs">create_cron</code>) o la CLI (<code className="font-mono text-xs">easybits crons</code>).
          </p>
        </div>
        {!showForm && (
          <BrutalButton type="button" mode="brand" onClick={() => setShowForm(true)}>
            Nuevo cron
          </BrutalButton>
        )}
      </div>

      {showForm && (
        <CronForm
          agents={agents}
          onCancel={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}

      {error && <p className="mb-3 text-sm font-bold text-red-600">{error}</p>}

      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0_#000]">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left font-bold text-xs uppercase">Cron</th>
              <th className="p-3 text-left font-bold text-xs uppercase max-md:hidden">Última</th>
              <th className="p-3 text-left font-bold text-xs uppercase max-md:hidden">Próxima</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items === null && (
              <tr>
                <td colSpan={4} className="p-3 text-gray-500">
                  Cargando…
                </td>
              </tr>
            )}
            {items?.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-gray-500">
                  Todavía no tienes crons.
                </td>
              </tr>
            )}
            {items?.map((c) => {
              const dot = !c.enabled ? "bg-gray-400" : c.lastOk === false ? "bg-red-500" : c.lastOk ? "bg-green-500" : "bg-white";
              const target =
                c.action.type === "http"
                  ? `${c.action.method} ${c.action.url}`
                  : c.action.type === "exec"
                    ? `$ ${c.action.command}${c.action.secrets?.length ? ` (con ${c.action.secrets.map((x) => x.name).join(", ")})` : ""}`
                    : `turno a «${agents.find((a) => a.id === (c.action as { fleetAgentId: string }).fleetAgentId)?.name ?? "agente"}»`;
              const isOpen = open?.id === c.id ? open.what : null;
              return (
                <Fragment key={c.id}>
                  <tr className="border-t border-gray-200 align-top">
                    <td className="p-3 w-full">
                      <p className="flex items-center gap-2 font-bold leading-tight">
                        <span className={`w-3 h-3 shrink-0 rounded-full border-2 border-black ${dot}`} />
                        {c.name}
                      </p>
                      <p className="mt-1 pl-5 text-xs text-gray-500">
                        {c.schedule} · <span className="font-mono break-all">{target}</span>
                      </p>
                      {c.lastError && (
                        <p className="mt-1 pl-5 text-xs text-red-600 break-all line-clamp-2" title={c.lastError}>
                          {c.lastError}
                        </p>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap max-md:hidden" suppressHydrationWarning>
                      {relative(c.lastRunAt)}
                      {c.lastStatus != null && <span className="block text-xs text-gray-500">HTTP {c.lastStatus}</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap max-md:hidden">
                      {c.enabled && c.nextRunLocal ? (
                        <>
                          {c.nextRunLocal}
                          {c.in && <span className="block text-xs text-gray-500">en {c.in}</span>}
                        </>
                      ) : c.done ? (
                        "terminado"
                      ) : (
                        "en pausa"
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <BrutalButton type="button" size="chip" mode="ghost" isDisabled={!!busy} onClick={() => act(c.id, "run")}>
                          {busy === `${c.id}:run` ? "…" : "Ejecutar"}
                        </BrutalButton>
                        <BrutalButton type="button" size="chip" mode={isOpen === "runs" ? "brand" : "ghost"} onClick={() => toggle(c.id, "runs")}>
                          Historial
                        </BrutalButton>
                        <BrutalButton type="button" size="chip" mode={isOpen === "edit" ? "brand" : "ghost"} onClick={() => toggle(c.id, "edit")}>
                          Editar
                        </BrutalButton>
                        <BrutalButton
                          type="button"
                          size="chip"
                          mode={c.enabled ? "ghost" : "brand"}
                          isDisabled={!!busy}
                          onClick={() => act(c.id, c.enabled ? "pause" : "resume")}
                        >
                          {c.enabled ? "Pausar" : "Reanudar"}
                        </BrutalButton>
                        <BrutalButton type="button" size="chip" mode="danger" isDisabled={!!busy} onClick={() => act(c.id, "delete")}>
                          Borrar
                        </BrutalButton>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="p-3">
                        {isOpen === "runs" ? (
                          <RunsList cronId={c.id} />
                        ) : (
                          <CronForm
                            agents={agents}
                            initial={c}
                            onCancel={() => setOpen(null)}
                            onSaved={async () => {
                              setOpen(null);
                              await load();
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Historial de un cron: GET /api/v2/crons/:id/runs?logs=1 (lo mismo que `list_my_crons` con `logs:true`). */
function RunsList({ cronId }: { cronId: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api(`/api/v2/crons/${cronId}/runs?logs=1`)
      .then((r: { items: Run[] }) => setRuns(r.items))
      .catch((e: Error) => setError(e.message));
  }, [cronId]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm font-bold text-red-600">{error}</p>;
  if (runs === null) return <p className="text-sm text-gray-500">Cargando historial…</p>;
  if (!runs.length) return <p className="text-sm text-gray-500">Todavía no ha corrido.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className={label}>Últimas {runs.length} corridas</p>
        <BrutalButton type="button" size="chip" mode="ghost" onClick={load}>
          Recargar
        </BrutalButton>
      </div>
      <ul className="grid gap-2">
        {runs.map((r) => {
          const chip = r.running
            ? ["corriendo", "bg-yellow-200"]
            : r.ok
              ? ["ok", "bg-green-200"]
              : r.ok === false
                ? ["falló", "bg-red-200"]
                : ["sin terminar", "bg-gray-200"];
          return (
            <li key={r.id} className="rounded-lg border-2 border-black bg-white p-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`rounded border-2 border-black px-1.5 font-bold ${chip[1]}`}>{chip[0]}</span>
                <span className="font-mono" suppressHydrationWarning>
                  {new Date(r.startedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="text-gray-500">{duration(r.durationMs)}</span>
                {r.exitCode != null && <span className="font-mono">exit {r.exitCode}</span>}
                {r.status != null && <span className="font-mono">HTTP {r.status}</span>}
                {r.trigger === "manual" && <span className="text-gray-500">(a mano)</span>}
              </div>
              {(r.summary || r.error) && (
                <p className={`mt-1 break-all ${r.error ? "text-red-600" : "text-gray-700"}`}>{r.error || r.summary}</p>
              )}
              {r.logs && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-bold">Logs</summary>
                  <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border-2 border-black bg-gray-900 p-2 text-[11px] text-gray-100">
                    {r.logs}
                  </pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Alta (POST) o edición (PATCH, con `initial`). En edición la acción no se toca: eso va por CLI/API. */
function CronForm({
  agents,
  initial,
  onCancel,
  onSaved,
}: {
  agents: Agent[];
  initial?: UserCron;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const editing = !!initial;
  // Buzones de eventos de la cuenta, para mandar ahí el resultado de cada corrida.
  const [inboxes, setInboxes] = useState<{ id: string; name: string }[]>([]);
  // Nombres de la bóveda (los valores nunca salen). Los acotados a un cron o máquina (`__C_`/`__M_`) no se ofrecen.
  const [vault, setVault] = useState<string[]>([]);
  useEffect(() => {
    api("/api/v2/inboxes")
      .then((r: { items?: { id: string; name: string }[] }) => setInboxes(r.items ?? []))
      .catch(() => undefined);
    if (!editing) {
      api("/api/v2/secrets")
        .then((r: { items?: { name: string }[] }) => setVault((r.items ?? []).map((s) => s.name).filter((n) => !n.includes("__"))))
        .catch(() => undefined);
    }
  }, [editing]);

  const [timezone] = useState(() => {
    if (initial) return initial.timezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
    } catch {
      return DEFAULT_TZ;
    }
  });
  const [name, setName] = useState(initial?.name ?? "");
  // Al editar, un recurrente se precarga como expresión cron (es lo que guarda el servidor).
  const initialWhen: When = initial
    ? initial.kind === "once"
      ? { mode: "once", time: "08:30", day: "1", every: "15", cron: "", at: initial.at ? toLocalInput(initial.at, timezone) : "" }
      : { mode: "custom", time: "08:30", day: "1", every: "15", cron: initial.cron, at: "" }
    : { mode: "daily", time: "08:30", day: "1", every: "15", cron: "", at: "" };
  const initialEnds: Ends = {
    mode: initial?.timesLeft != null ? "times" : initial?.until ? "until" : "never",
    times: String(initial?.timesLeft ?? 10),
    until: initial?.until ? toLocalInput(initial.until, timezone).slice(0, 10) : "",
  };
  const [when, setWhen] = useState<When>(initialWhen);
  const [ends, setEnds] = useState<Ends>(initialEnds);
  const [kind, setKind] = useState<"http" | "agent_turn" | "exec">("http");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretHeader, setSecretHeader] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [command, setCommand] = useState("");
  const [template, setTemplate] = useState<string>("python");
  const [timeout, setTimeoutS] = useState("300");
  const [execSecrets, setExecSecrets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifyPush, setNotifyPush] = useState(!!initial?.notify?.push);
  const [notifyEmail, setNotifyEmail] = useState(!!initial?.notify?.email);
  const [notifyInbox, setNotifyInbox] = useState(initial?.notify?.inbox ?? "");
  const [notifyAlways, setNotifyAlways] = useState(initial?.notify?.on === "always");
  const once = when.mode === "once";
  const cron = once ? "" : toCron(when);

  /** El horario como lo recibe la API: `at` o `cron` + `until`/`times` (null = nunca termina). */
  const schedule = () =>
    once
      ? { at: when.at }
      : {
          cron,
          until: ends.mode === "until" && ends.until ? `${ends.until}T23:59` : null,
          times: ends.mode === "times" ? Number(ends.times) : null,
        };
  const scheduleKey = (w: When, e: Ends) => JSON.stringify([w.mode === "once" ? w.at : toCron(w), w.mode === "once" ? null : e]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const notify =
      notifyPush || notifyEmail || notifyInbox
        ? {
            on: notifyAlways ? "always" : "failure",
            // Al editar se conserva el secreto de push que ya tenía (puede no ser el default).
            ...(notifyPush ? { push: initial?.notify?.push ?? true } : {}),
            ...(notifyEmail ? { email: true } : {}),
            ...(notifyInbox ? { inbox: notifyInbox } : {}),
          }
        : null;
    try {
      if (initial) {
        // Sólo se manda el horario si cambió: un «una vez» que ya corrió no se revalida contra «ahora».
        const changed = scheduleKey(when, ends) !== scheduleKey(initialWhen, initialEnds);
        await api(`/api/v2/crons/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, notify, ...(changed ? { ...schedule(), timezone } : {}) }),
        });
      } else {
        const action =
          kind === "http"
            ? {
                type: "http",
                url,
                method,
                ...(body ? { body } : {}),
                ...(secretName ? { secretName, ...(secretHeader ? { secretHeader } : {}) } : {}),
              }
            : kind === "exec"
              ? {
                  type: "exec",
                  command,
                  template,
                  timeoutSeconds: Number(timeout) || 300,
                  ...(execSecrets.length ? { secrets: execSecrets.map((n) => ({ name: n })) } : {}),
                }
              : { type: "agent_turn", fleetAgentId: agentId || agents[0]?.id, prompt };
        const sched = schedule();
        await api("/api/v2/crons", {
          method: "POST",
          body: JSON.stringify({
            name,
            ...(once ? sched : { cron, ...(sched.until ? { until: sched.until } : {}), ...(sched.times ? { times: sched.times } : {}) }),
            timezone,
            action,
            ...(notify ? { notify } : {}),
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<When>) => setWhen((w) => ({ ...w, ...patch }));
  const setE = (patch: Partial<Ends>) => setEnds((x) => ({ ...x, ...patch }));

  return (
    <form
      onSubmit={submit}
      className={`grid gap-4 rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_#000] md:grid-cols-2 ${editing ? "text-left" : "mb-6"}`}
    >
      <div className="md:col-span-2">
        <label className={label}>Nombre</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Despertador de estudio" required />
      </div>

      <div>
        <label className={label}>Cuándo</label>
        <select className={input} value={when.mode} onChange={(e) => set({ mode: e.target.value as When["mode"] })}>
          <option value="once">Una sola vez</option>
          <option value="daily">Todos los días</option>
          <option value="weekdays">De lunes a viernes</option>
          <option value="weekly">Una vez por semana</option>
          <option value="every">Cada cierto tiempo</option>
          <option value="custom">Avanzado (expresión cron)</option>
        </select>
      </div>
      <div className="flex gap-2">
        {(when.mode === "daily" || when.mode === "weekdays" || when.mode === "weekly") && (
          <>
            {when.mode === "weekly" && (
              <div className="flex-1">
                <label className={label}>Día</label>
                <select className={input} value={when.day} onChange={(e) => set({ day: e.target.value })}>
                  {DAYS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1">
              <label className={label}>A las</label>
              <input type="time" className={input} value={when.time} onChange={(e) => set({ time: e.target.value })} required />
            </div>
          </>
        )}
        {once && (
          <div className="flex-1">
            <label className={label}>El</label>
            <input type="datetime-local" className={input} value={when.at} onChange={(e) => set({ at: e.target.value })} required />
          </div>
        )}
        {when.mode === "every" && (
          <div className="flex-1">
            <label className={label}>Cada</label>
            <select className={input} value={when.every} onChange={(e) => set({ every: e.target.value })}>
              {["5", "10", "15", "30", "60"].map((m) => (
                <option key={m} value={m}>
                  {m === "60" ? "1 hora" : `${m} minutos`}
                </option>
              ))}
            </select>
          </div>
        )}
        {when.mode === "custom" && (
          <div className="flex-1">
            <label className={label}>Cron (5 campos)</label>
            <input className={`${input} font-mono`} value={when.cron} onChange={(e) => set({ cron: e.target.value })} placeholder="30 8 * * 1-5" required />
          </div>
        )}
      </div>

      {!once && (
        <div className="md:col-span-2 flex flex-wrap items-end gap-2">
          <div className="w-56">
            <label className={label}>Termina</label>
            <select className={input} value={ends.mode} onChange={(e) => setE({ mode: e.target.value as Ends["mode"] })}>
              <option value="never">Nunca</option>
              <option value="times">Después de N veces</option>
              <option value="until">El día…</option>
            </select>
          </div>
          {ends.mode === "times" && (
            <div className="w-32">
              <label className={label}>Veces</label>
              <input type="number" min={1} max={10000} className={input} value={ends.times} onChange={(e) => setE({ times: e.target.value })} required />
            </div>
          )}
          {ends.mode === "until" && (
            <div className="w-48">
              <label className={label}>Último día</label>
              <input type="date" className={input} value={ends.until} onChange={(e) => setE({ until: e.target.value })} required />
            </div>
          )}
        </div>
      )}

      <p className="md:col-span-2 -mt-2 text-xs text-gray-500">
        {once ? (
          <>Corre una vez y se apaga · zona {timezone}</>
        ) : (
          <>
            <span className="font-mono">{cron || "—"}</span> · zona {timezone} · mínimo cada 5 minutos
          </>
        )}
      </p>

      {editing ? (
        <p className="md:col-span-2 rounded-lg border-2 border-dashed border-black p-3 text-xs text-gray-600">
          La acción no se edita desde el panel. Para cambiarla usa la API (<code className="font-mono">PATCH /api/v2/crons/{initial!.id}</code>{" "}
          con <code className="font-mono">action</code>) o la CLI: borra este cron y créalo de nuevo con{" "}
          <code className="font-mono">easybits crons create … --run …</code>.
        </p>
      ) : (
        <>
          <div className="md:col-span-2">
            <label className={label}>Qué hace</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={kind === "http"} onChange={() => setKind("http")} /> Pegarle a una URL
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={kind === "agent_turn"} onChange={() => setKind("agent_turn")} disabled={!agents.length} />
                Mandarle un mensaje a un agente{!agents.length && " (no tienes agentes)"}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={kind === "exec"} onChange={() => setKind("exec")} /> Correr un comando
              </label>
            </div>
          </div>

          {kind === "http" && (
            <>
              <div className="md:col-span-2 flex gap-2">
                <select className={`${input} w-28`} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input className={input} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
              </div>
              {method !== "GET" && (
                <div className="md:col-span-2">
                  <label className={label}>Body (opcional, JSON o texto)</label>
                  <textarea className={`${input} font-mono`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
              )}
              <div>
                <label className={label}>Secreto del vault (opcional)</label>
                <input className={`${input} font-mono`} value={secretName} onChange={(e) => setSecretName(e.target.value.toUpperCase())} placeholder="MI_TOKEN" />
              </div>
              <div>
                <label className={label}>Header del secreto</label>
                <input className={`${input} font-mono`} value={secretHeader} onChange={(e) => setSecretHeader(e.target.value)} placeholder="Authorization (Bearer)" />
              </div>
            </>
          )}

          {kind === "agent_turn" && (
            <>
              <div>
                <label className={label}>Agente</label>
                <select className={input} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={label}>Mensaje</label>
                <textarea className={input} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
              </div>
            </>
          )}

          {kind === "exec" && (
            <>
              <div className="md:col-span-2">
                <label className={label}>Comando</label>
                <textarea
                  className={`${input} font-mono`}
                  rows={3}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="pip install -q requests && python3 -c 'print(1)'"
                  required
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={label}>Plantilla</label>
                  <select className={input} value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {TEMPLATES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className={label}>Timeout (s)</label>
                  <input type="number" min={1} max={600} className={input} value={timeout} onChange={(e) => setTimeoutS(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={label}>Secretos como variables</label>
                {vault.length ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {vault.map((n) => (
                      <label key={n} className="flex items-center gap-1 font-mono">
                        <input
                          type="checkbox"
                          checked={execSecrets.includes(n)}
                          onChange={(e) => setExecSecrets((xs) => (e.target.checked ? [...xs, n] : xs.filter((x) => x !== n)))}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Tu bóveda está vacía (<a className="underline" href="/dash/developer/secrets">Secretos</a>).
                  </p>
                )}
              </div>
              <p className="md:col-span-2 -mt-2 text-xs text-gray-500">
                Corre en una caja nueva que se destruye al terminar; éxito = exit 0. Para archivos y llaves sólo de este cron usa la
                CLI: <code className="font-mono">easybits crons create … --run … --file … --secret-file NOMBRE:ruta</code>.
              </p>
            </>
          )}
        </>
      )}

      <div className="md:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={label}>Avisarme</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={notifyPush} onChange={(e) => setNotifyPush(e.target.checked)} /> push a la app de Ghosty
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /> correo
        </label>
        {inboxes.length > 0 && (
          <label className="flex items-center gap-1.5">
            buzón
            <select className="border-2 border-gray-200 rounded px-1 py-0.5" value={notifyInbox} onChange={(e) => setNotifyInbox(e.target.value)}>
              <option value="">—</option>
              {inboxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(notifyPush || notifyEmail || notifyInbox) && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={notifyAlways} onChange={(e) => setNotifyAlways(e.target.checked)} /> también cuando sale bien
          </label>
        )}
        {notifyPush && <span className="text-xs text-gray-500">Usa el secreto GHOSTY_PUSH_TOKEN de tu bóveda (token personal de la app).</span>}
      </div>

      {error && <p className="md:col-span-2 text-sm font-bold text-red-600">{error}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <BrutalButton type="button" mode="ghost" onClick={onCancel}>
          Cancelar
        </BrutalButton>
        <BrutalButton type="submit" mode="brand" isDisabled={saving}>
          {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cron"}
        </BrutalButton>
      </div>
    </form>
  );
}
