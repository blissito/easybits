import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRevalidator } from "react-router";
import { isInternalSecretName } from "~/lib/secrets";
import { CopilotSplit, useCopilotSplit } from "./CopilotSplit";

// Bittor (piloto de ghostykit): sólo se descarga al abrirlo.
const CronsCopilot = lazy(() => import("./CronsCopilot").then((m) => ({ default: m.CronsCopilot })));
import type { IconType } from "react-icons";
import {
  PiAlarmDuotone,
  PiArrowsClockwiseBold,
  PiBellRingingBold,
  PiCheckCircleBold,
  PiCircleNotchBold,
  PiClockCounterClockwiseBold,
  PiCodeBold,
  PiFlagCheckeredBold,
  PiGlobeHemisphereWestDuotone,
  PiHandTapBold,
  PiPauseBold,
  PiPencilSimpleBold,
  PiHardDrivesDuotone,
  PiKeyDuotone,
  PiMagnifyingGlassBold,
  PiChatCircleDotsDuotone,
  PiPlayFill,
  PiPlayPauseBold,
  PiPlusBold,
  PiPulseBold,
  PiRobotDuotone,
  PiTerminalWindowDuotone,
  PiTrashBold,
  PiWarningCircleBold,
  PiCheckBold,
  PiCheckCircleDuotone,
  PiDeviceMobileDuotone,
  PiEnvelopeSimpleDuotone,
  PiTrayDuotone,
  PiXBold,
  PiXCircleBold,
} from "react-icons/pi";

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
      machine?: string;
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

const input =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15";
const label = "block text-xs font-bold text-gray-700 mb-1";

const KIND = {
  http: { icon: PiGlobeHemisphereWestDuotone, name: "URL", tint: "bg-sky/50 text-cyan-900" },
  agent_turn: { icon: PiRobotDuotone, name: "Agente", tint: "bg-brand-100 text-brand-500" },
  exec: { icon: PiTerminalWindowDuotone, name: "Comando", tint: "bg-lime/60 text-green-900" },
} as const;

/** Estado de un cron en palabras, con su icono y color. */
function stateOf(c: UserCron) {
  if (c.done) return { text: "terminado", icon: PiFlagCheckeredBold, cls: "bg-gray-100 text-gray-600" };
  if (!c.enabled) return { text: "en pausa", icon: PiPauseBold, cls: "bg-gray-100 text-gray-600" };
  if (c.lastOk === false) return { text: "falló", icon: PiWarningCircleBold, cls: "bg-red-50 text-red-700" };
  return { text: "activo", icon: PiPulseBold, cls: "bg-green-50 text-green-700" };
}

/** Un campo de cron (`*`, `*\/n`, `a-b`, `a-b/n`, listas) → valores; null si no se entiende. */
function expandField(f: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of f.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    const [a, b] = m[1] === "*" ? [min, max] : m[1].includes("-") ? m[1].split("-").map(Number) : [Number(m[1]), m[2] ? max : Number(m[1])];
    if (!step || a < min || b > max) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return [...out];
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** «Ahora» en la zona del cron: minuto del día y día de la semana. */
function nowIn(tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { min: Number(p.hour) * 60 + Number(p.minute), dow: WEEKDAY[p.weekday] ?? 0 };
}

/** Minutos desde ahora de cada disparo en las próximas 24 h; null si el cron depende del día del mes. */
function firesIn24h(c: UserCron): number[] | null {
  if (c.kind === "once" || !c.cron) return null;
  const [mi, ho, dom, mon, dw] = c.cron.trim().split(/\s+/);
  if (dom !== "*" || mon !== "*") return null;
  const mins = expandField(mi, 0, 59);
  const hours = expandField(ho, 0, 23);
  const dows = expandField(dw, 0, 7);
  if (!mins || !hours || !dows) return null;
  const days = new Set(dows.map((d) => d % 7));
  const now = nowIn(c.timezone);
  const out: number[] = [];
  for (const d of [0, 1])
    for (const h of hours)
      for (const m of mins) {
        const t = d * 1440 + h * 60 + m - now.min;
        if (t > 0 && t <= 1440 && days.has((now.dow + d) % 7)) out.push(t);
      }
  return out.sort((a, b) => a - b);
}

/** La línea de las próximas 24 h: cada punto es un disparo; el morado grande, el próximo. */
function DayRibbon({ c }: { c: UserCron }) {
  const now = nowIn(c.timezone);
  let marks = c.enabled ? firesIn24h(c) : [];
  if (marks === null) {
    const next = c.nextRunAt ? (new Date(c.nextRunAt).getTime() - Date.now()) / 60_000 : -1;
    marks = next > 0 && next <= 1440 ? [next] : [];
  }
  const ticks = Array.from({ length: 24 }, (_, k) => {
    const hour = Math.floor(now.min / 60) + k + 1;
    return { at: hour * 60 - now.min, h: hour % 24 };
  }).filter((t) => t.h % 6 === 0);
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  const dense = marks.length > 48;
  const [next, ...rest] = marks;
  return (
    <div className="relative h-11 select-none" suppressHydrationWarning aria-hidden>
      <div className="absolute inset-x-0 top-5 h-1.5 rounded-full bg-gray-100" />
      {next != null && <div className="absolute left-0 top-5 h-1.5 rounded-full bg-brand-500/25" style={{ width: pct(next) }} />}
      <span className="absolute left-0 top-[17px] size-3 rounded-full bg-black ring-4 ring-white" />
      {ticks.map((t) => (
        <span key={t.at} className="absolute top-8 -translate-x-1/2 text-[10px] tabular-nums text-gray-400" style={{ left: pct(t.at) }}>
          {String(t.h).padStart(2, "0")}:00
        </span>
      ))}
      {rest.map((m) =>
        dense ? (
          <span key={m} className="absolute top-5 h-1.5 w-px bg-brand-500/50" style={{ left: pct(m) }} />
        ) : (
          <span key={m} className="absolute top-[19px] size-2 -translate-x-1/2 rounded-full bg-brand-500/60" style={{ left: pct(m) }} />
        )
      )}
      {next != null && (
        <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(next) }}>
          <span className="rounded-md bg-black px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">
            {c.nextRunLocal?.slice(11) ?? ""}
          </span>
          <span className="mt-0.5 size-3.5 rounded-full bg-brand-500 ring-4 ring-brand-500/20" />
        </span>
      )}
      {!c.enabled && (
        <span className="absolute inset-x-0 top-0 text-center text-[11px] text-gray-400">
          {c.done ? "Ya no se va a ejecutar" : "En pausa: no se ejecuta hasta que lo reanudes"}
        </span>
      )}
    </div>
  );
}

/** Secretos de la bóveda para un `exec`: buscador, elegidos como chips y la lista con interruptores. */
function SecretPicker({ names, value, onChange }: { names: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = names.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()));
  const set = (n: string, on: boolean) => onChange(on ? [...value, n] : value.filter((x) => x !== n));
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/10">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-3 py-2.5">
          {value.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set(n, false)}
              aria-label={`Quitar ${n}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-0.5 pl-2 pr-1 font-mono text-[11px] text-brand-500 hover:bg-brand-500 hover:text-white"
            >
              {n} <PiXBold />
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border-b border-gray-100 px-3">
        <PiMagnifyingGlassBold className="text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar entre ${names.length} secretos…`}
          className="w-full bg-transparent py-2.5 text-sm outline-none"
        />
      </label>
      <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto">
        {shown.map((n) => (
          <SwitchRow key={n} icon={PiKeyDuotone} title={n} mono checked={value.includes(n)} onChange={(on) => set(n, on)} />
        ))}
        {!shown.length && <li className="px-4 py-3 text-xs text-gray-500">Ningún secreto se llama así.</li>}
      </ul>
    </div>
  );
}

/** Fila de ajustes: icono, título y explicación a la izquierda; interruptor a la derecha. Toda la fila se pulsa. */
function SwitchRow({
  icon: Icon,
  title,
  hint,
  checked,
  onChange,
  disabled,
  mono,
}: {
  icon: IconType;
  title: string;
  hint?: string;
  mono?: boolean;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex w-full items-center gap-3 px-4 text-left ${mono ? "py-2" : "py-3"} transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
      >
        <Icon className="shrink-0 text-xl text-brand-500" />
        <span className="min-w-0 flex-1">
          <span className={`block ${mono ? "break-all font-mono text-xs" : "text-sm font-semibold"}`}>{title}</span>
          {hint && <span className="block text-xs text-gray-500">{hint}</span>}
        </span>
        <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}>
          <span
            className={`absolute size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </span>
      </button>
    </li>
  );
}

/** Botón redondo de icono: el nombre va en aria-label y tooltip. */
function IconButton({
  title,
  icon: Icon,
  onClick,
  active,
  disabled,
  danger,
}: {
  title: string;
  icon: IconType;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-full text-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-black text-white" : danger ? "text-gray-500 hover:bg-red-50 hover:text-red-600" : "text-gray-600 hover:bg-gray-100 hover:text-black"
      }`}
    >
      <Icon />
    </button>
  );
}

/** «16h 14m» → cifras grandes, unidades chicas. */
function Countdown({ text }: { text: string }) {
  const parts = [...text.matchAll(/(\d+)\s*([a-zA-Z]+)/g)];
  if (!parts.length) return <span>{text}</span>;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {parts.map(([, n, u]) => (
        <span key={u}>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{n}</span>
          <span className="ml-0.5 text-base font-medium text-gray-400">{u}</span>
        </span>
      ))}
    </span>
  );
}

/** «2026-10-19 12:00» → «dom 19 oct, 12:00» (ya viene en la zona del cron). */
function prettyLocal(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** `copilot`: Bittor en un panel (en admin va el piloto de la plataforma y aquí se apaga). */
export function UserCronsSection({ copilot = true }: { copilot?: boolean } = {}) {
  const [items, setItems] = useState<UserCron[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [machines, setMachines] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Tarjeta abierta: su historial o su formulario de edición.
  const [open, setOpen] = useState<{ id: string; what: "runs" | "edit" } | null>(null);
  // Bittor: el mismo panel que el piloto de admin (empuja en escritorio, hoja en móvil).
  const split = useCopilotSplit("eb:my-crons-copilot-width");
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const openBittor = (text?: string) => {
    split.open();
    if (text) setAsk((a) => ({ text, key: (a?.key ?? 0) + 1 }));
  };

  const load = useCallback(async () => {
    try {
      const r = await api("/api/v2/crons?include=agents,machines");
      setItems(r.items);
      setAgents(r.agents ?? []);
      setMachines(r.machines ?? []);
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

  // Ejecuciones lanzadas desde aquí: se quedan a la vista (en curso → resultado) hasta que se cierran.
  const [live, setLive] = useState<Record<string, LiveRun>>({});

  /** «Ejecutar»: lanza y espera (long-poll /runs/next) a que esa ejecución termine. */
  const runNow = async (id: string) => {
    // Un margen por si el reloj del navegador va adelantado respecto al servidor.
    const after = new Date(Date.now() - 5000).toISOString();
    setLive((l) => ({ ...l, [id]: { startedAt: Date.now() } }));
    setOpen({ id, what: "runs" });
    try {
      await api(`/api/v2/crons/${id}/run`, { method: "POST" });
      for (let i = 0; i < 20; i++) {
        const r = await api(`/api/v2/crons/${id}/runs/next?wait=50&after=${encodeURIComponent(after)}`);
        if (r.run) {
          setLive((l) => ({ ...l, [id]: { ...l[id], run: r.run } }));
          break;
        }
      }
    } catch (e) {
      setLive((l) => ({ ...l, [id]: { ...l[id], error: (e as Error).message } }));
    }
    await load();
  };

  const toggle = (id: string, what: "runs" | "edit") => setOpen((o) => (o?.id === id && o.what === what ? null : { id, what }));

  const act = async (id: string, what: "pause" | "resume" | "delete") => {
    if (what === "delete" && !confirm("¿Borrar este cron?")) return;
    setBusy(`${id}:${what}`);
    setError(null);
    try {
      if (what === "delete") await api(`/api/v2/crons/${id}`, { method: "DELETE" });
      if (what === "pause" || what === "resume") {
        await api(`/api/v2/crons/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: what === "resume" }) });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const content = (
    // En admin va debajo de la tabla; en su pestaña arranca pegada a la navegación (el panel de Bittor empieza aquí).
    <section className={`pb-10 pr-2 ${copilot ? "" : "mt-10"}`}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-3xl font-black tracking-tight">Mis crons</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-gray-600">
            Tareas que corren solas a la hora que digas: le pegan a una URL, le escriben a uno de tus agentes o ejecutan un comando en
            una caja.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {[
              ["API", "/api/v2/crons"],
              ["MCP", "create_cron"],
              ["CLI", "easybits crons"],
            ].map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-1 pr-2.5">
                <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-gray-700 shadow-sm">{k}</span>
                <code className="font-mono text-gray-700">{v}</code>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {copilot && !split.isOpen && (
            <button
              type="button"
              onClick={() => openBittor()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-black/15 transition hover:ring-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <PiChatCircleDotsDuotone className="text-lg text-brand-500" /> Pídeselo a Bittor
            </button>
          )}
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <PiPlusBold /> Nuevo cron
            </button>
          )}
        </div>
      </header>

      {showForm && (
        <CronForm
          agents={agents}
          machines={machines}
          onCancel={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}

      {error && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <PiWarningCircleBold className="shrink-0 text-lg" /> {error}
        </p>
      )}

      {items === null && (
        <div className="grid gap-4" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl bg-gray-100" />
          ))}
        </div>
      )}

      {items?.length === 0 && !showForm && (
        <div className="grid place-items-center gap-3 rounded-3xl bg-gray-50 px-6 py-14 text-center ring-1 ring-black/5">
          <PiAlarmDuotone className="text-6xl text-brand-500" />
          <p className="max-w-sm text-sm text-gray-600">
            Programa tu primera tarea: un aviso cada mañana, un respaldo cada noche o un mensaje semanal a tu agente.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white"
          >
            <PiPlusBold /> Crear mi primer cron
          </button>
        </div>
      )}

      <ul className="grid gap-4">
        {items?.map((c) => {
          const kind = KIND[c.action.type];
          const state = stateOf(c);
          const secrets = c.action.type === "exec" ? (c.action.secrets ?? []).map((x) => x.name) : c.action.type === "http" && c.action.secretName ? [c.action.secretName] : [];
          const machineName = c.action.type === "exec" && c.action.machine ? machines.find((m) => m.id === (c.action as { machine?: string }).machine)?.name ?? c.action.machine : null;
          const agentName = c.action.type === "agent_turn" ? agents.find((a) => a.id === (c.action as { fleetAgentId: string }).fleetAgentId)?.name ?? "agente" : "";
          const schedule = c.schedule.replace(` ${c.timezone}`, "");
          const isOpen = open?.id === c.id ? open.what : null;
          return (
            <li
              key={c.id}
              className={`overflow-hidden rounded-3xl bg-white ring-1 ring-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.18)] ${c.enabled ? "" : "opacity-80"}`}
            >
              {/* Móvil: apilado. Tablet: 2 columnas. Escritorio: quién · qué ejecuta + cuándo · cuenta y acciones. */}
              <div className="grid items-start gap-x-6 gap-y-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:p-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:gap-y-3">
                <div className="flex min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${kind.tint}`} title={kind.name}>
                    <kind.icon />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h4 className="text-lg font-bold leading-tight tracking-tight">{c.name}</h4>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.cls}`}>
                        <span className="relative flex size-1.5">
                          {state.text === "activo" && <span className="absolute inset-0 rounded-full bg-green-600 motion-safe:animate-ping" />}
                          <span className={`relative size-1.5 rounded-full ${state.text === "activo" ? "bg-green-600" : state.text === "falló" ? "bg-red-600" : "bg-gray-400"}`} />
                        </span>
                        {state.text}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500" title={c.timezone}>
                      {schedule}
                    </p>
                  </div>
                </div>

                <div className="md:text-right lg:col-start-3 lg:row-start-1" suppressHydrationWarning>
                  {c.enabled && c.in ? (
                    <div>
                      <Countdown text={c.in} />
                      <p className="text-xs text-gray-500">{prettyLocal(c.nextRunLocal)}</p>
                    </div>
                  ) : (
                    <p className="text-2xl font-semibold tracking-tight text-gray-400">{c.done ? "Terminado" : "En pausa"}</p>
                  )}
                </div>

                {/* Qué se ejecuta, tal cual */}
                <div className="overflow-hidden rounded-2xl bg-onix text-[13px] md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                  <div className="flex items-start gap-3 overflow-x-auto px-4 py-3 font-mono">
                    {c.action.type === "exec" && (
                      <>
                        <span className="select-none text-gray-500">$</span>
                        <code className="whitespace-pre text-lime">{c.action.command}</code>
                        {c.action.template && <span className="ml-auto shrink-0 font-sans text-[11px] text-gray-500">{c.action.template}</span>}
                      </>
                    )}
                    {c.action.type === "http" && (
                      <>
                        <span className="shrink-0 rounded bg-white/10 px-1.5 text-[11px] font-bold text-sky">{c.action.method}</span>
                        <code className="whitespace-pre text-gray-100">{c.action.url}</code>
                      </>
                    )}
                    {c.action.type === "agent_turn" && (
                      <>
                        <span className="shrink-0 font-sans text-[11px] font-semibold text-rose">→ {agentName}</span>
                        <code className="line-clamp-2 whitespace-pre-wrap text-gray-100">{c.action.prompt}</code>
                      </>
                    )}
                  </div>
                  {machineName && (
                    <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-300">
                      <PiHardDrivesDuotone className="text-base text-sky" />
                      con la configuración de <span className="font-mono text-white">{machineName}</span>
                    </div>
                  )}
                  {secrets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-4 py-2.5">
                      <PiKeyDuotone className="text-base text-brand-yellow" title="Secretos que recibe" />
                      {secrets.map((n) => (
                        <span key={n} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-gray-200">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-2">
                  <DayRibbon c={c} />
                </div>

                {c.lastError && (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 px-3 py-2 md:col-span-2 lg:col-span-3 lg:row-start-3">
                    <p className="line-clamp-2 flex-1 break-all font-mono text-xs text-red-700" title={c.lastError}>
                      {c.lastError}
                    </p>
                    {copilot && (
                      <button
                        type="button"
                        onClick={() => openBittor(`¿Por qué falló «${c.name}» en su última ejecución y cómo lo arreglo?`)}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:ring-red-400"
                      >
                        Pregúntale a Bittor
                      </button>
                    )}
                  </div>
                )}

                <p className="flex items-center gap-1.5 self-center text-xs text-gray-500 lg:col-start-1 lg:row-start-2 lg:pl-16" suppressHydrationWarning>
                    {c.lastOk === false ? (
                      <PiXCircleBold className="text-base text-red-600" />
                    ) : c.lastOk ? (
                      <PiCheckCircleBold className="text-base text-green-600" />
                    ) : null}
                    {c.lastRunAt ? `Última ${relative(c.lastRunAt)}` : "Nunca se ha ejecutado"}
                    {c.lastStatus != null && <span className="rounded bg-gray-100 px-1 font-mono text-[11px]">HTTP {c.lastStatus}</span>}
                </p>
                <div className="flex items-center justify-end gap-1 self-center lg:col-start-3 lg:row-start-2">
                    <IconButton title="Historial" icon={PiClockCounterClockwiseBold} active={isOpen === "runs"} onClick={() => toggle(c.id, "runs")} />
                    <IconButton title="Editar" icon={PiPencilSimpleBold} active={isOpen === "edit"} onClick={() => toggle(c.id, "edit")} />
                    {!c.done && (
                      <IconButton
                        title={c.enabled ? "Pausar" : "Reanudar"}
                        icon={c.enabled ? PiPauseBold : PiPlayPauseBold}
                        disabled={!!busy}
                        onClick={() => act(c.id, c.enabled ? "pause" : "resume")}
                      />
                    )}
                    <IconButton title="Borrar" icon={PiTrashBold} danger disabled={!!busy} onClick={() => act(c.id, "delete")} />
                    <button
                      type="button"
                      disabled={!!busy || (!!live[c.id] && !live[c.id].run && !live[c.id].error)}
                      onClick={() => runNow(c.id)}
                      className="ml-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {live[c.id] && !live[c.id].run && !live[c.id].error ? <PiCircleNotchBold className="animate-spin" /> : <PiPlayFill />}
                      {live[c.id] && !live[c.id].run && !live[c.id].error ? "Ejecutando" : live[c.id] ? "Otra vez" : "Ejecutar"}
                    </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-black/5 bg-gray-50/70 p-5 md:p-6">
                  {isOpen === "runs" ? (
                    <RunsList cronId={c.id} live={live[c.id]} />
                  ) : (
                    <CronForm
                      agents={agents}
                      machines={machines}
                      initial={c}
                      onCancel={() => setOpen(null)}
                      onSaved={async () => {
                        setOpen(null);
                        await load();
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

    </section>
  );
  if (!copilot) return content;
  return (
    <CopilotSplit
      id="my-crons-layout"
      split={split}
      title="Bittor"
      className="md:-mr-8"
      copilot={(variant) => (
        <Suspense fallback={null}>
          <CronsCopilot
            surface="mine"
            variant={variant}
            ask={ask}
            job={null}
            cronId={open?.id ?? null}
            onClearJob={() => undefined}
            onClose={split.close}
            escBlocked={!split.isOpen}
            onChange={load}
          />
        </Suspense>
      )}
    >
      {content}
    </CopilotSplit>
  );
}

type LiveRun = { startedAt: number; run?: Run; error?: string };

/** Segundos desde `from`, refrescado mientras `on`. */
function useElapsed(from: number, on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [on]);
  return (now - from) / 1000;
}

/** Historial de un cron: GET /api/v2/crons/:id/runs?logs=1 (lo mismo que `list_my_crons` con `logs:true`). */
function RunsList({ cronId, live }: { cronId: string; live?: LiveRun }) {
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
  // En cuanto termina la ejecución lanzada desde aquí, se recarga y entra arriba.
  const doneId = live?.run?.id;
  useEffect(() => {
    if (doneId) load();
  }, [doneId, load]);

  const pending = !!live && !live.run && !live.error;
  const secs = useElapsed(live?.startedAt ?? 0, pending);

  if (error) return <p className="text-sm font-bold text-red-700">{error}</p>;
  if (runs === null && !pending) return <p className="text-sm text-gray-500">Cargando historial…</p>;
  const list = (runs ?? []).filter((r) => !(pending && r.running));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">{list.length ? `Últimas ${list.length} ejecuciones` : "Ejecuciones"}</p>
        <IconButton title="Recargar" icon={PiArrowsClockwiseBold} onClick={load} />
      </div>
      {!list.length && !pending && !live?.error && (
        <p className="text-sm text-gray-500">Todavía no se ha ejecutado. Usa «Ejecutar» para probarlo ahora.</p>
      )}
      <ol className="relative grid gap-3 pl-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-gray-300">
        <AnimatePresence initial={false}>
          {pending && (
            <motion.li
              key="pending"
              layout
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative"
              role="status"
              aria-live="polite"
            >
              <span className="absolute -left-6 top-2.5 grid size-5 place-items-center rounded-full bg-brand-500 text-[12px] text-white ring-4 ring-gray-50">
                <PiCircleNotchBold className="animate-spin" />
              </span>
              <div className="overflow-hidden rounded-2xl bg-white p-3 text-xs ring-2 ring-brand-500">
                <p className="flex items-baseline gap-3">
                  <span className="font-bold">Ejecutando…</span>
                  <span className="tabular-nums text-gray-500">{secs.toFixed(1)} s</span>
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-500/15">
                  <div className="h-full w-1/3 rounded-full bg-brand-500 motion-safe:animate-[cronbar_1.2s_ease-in-out_infinite]" />
                  <style>{"@keyframes cronbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}"}</style>
                </div>
              </div>
            </motion.li>
          )}
          {live?.error && (
            <motion.li key="live-error" layout initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="relative" role="alert">
              <span className="absolute -left-6 top-2.5 grid size-5 place-items-center rounded-full bg-red-600 text-[12px] text-white ring-4 ring-gray-50">
                <PiXBold />
              </span>
              <div className="rounded-2xl bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">
                <span className="font-bold">No se pudo ejecutar:</span> {live.error}
              </div>
            </motion.li>
          )}
          {list.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="relative"
            >
              <RunItem run={r} fresh={r.id === doneId} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}

/** Una ejecución del historial; la recién terminada llega resaltada y con sus logs abiertos. */
function RunItem({ run: r, fresh }: { run: Run; fresh: boolean }) {
  const st = r.running
    ? { icon: PiCircleNotchBold, cls: "bg-brand-yellow", text: "en ejecución", spin: true }
    : r.ok
      ? { icon: PiCheckBold, cls: "bg-green-600 text-white", text: "Salió bien" }
      : r.ok === false
        ? { icon: PiXBold, cls: "bg-red-600 text-white", text: "Falló" }
        : { icon: PiCircleNotchBold, cls: "bg-gray-200", text: "sin terminar" };
  const ring = fresh ? (r.ok ? "ring-2 ring-green-500 bg-green-50" : "ring-2 ring-red-500 bg-red-50") : "ring-1 ring-black/5 bg-white";
  return (
    <>
      <span className={`absolute -left-6 top-2.5 grid size-5 place-items-center rounded-full text-[11px] ring-4 ring-gray-50 ${st.cls}`}>
        <st.icon className={"spin" in st && st.spin ? "animate-spin" : ""} />
      </span>
      <div className={`rounded-2xl p-3 text-xs transition-colors duration-1000 ${ring}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">{st.text}</span>
          {fresh && <span className="rounded-full bg-black px-1.5 text-[10px] font-semibold text-white">recién</span>}
          <span className="tabular-nums" suppressHydrationWarning>
            {new Date(r.startedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <span className="text-gray-500">{duration(r.durationMs)}</span>
          {r.exitCode != null && <span className="font-mono">exit {r.exitCode}</span>}
          {r.status != null && <span className="font-mono">HTTP {r.status}</span>}
          {r.trigger === "manual" && (
            <span className="inline-flex items-center gap-1 text-gray-500">
              <PiHandTapBold /> a mano
            </span>
          )}
        </div>
        {(r.summary || r.error) && <p className={`mt-1 break-all ${r.error ? "text-red-700" : "text-gray-700"}`}>{r.error || r.summary}</p>}
        {r.logs && (
          <details className="mt-2" open={fresh}>
            <summary className="inline-flex cursor-pointer items-center gap-1 font-bold">
              <PiCodeBold /> Logs
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-onix p-3 text-[11px] text-lime">{r.logs}</pre>
          </details>
        )}
      </div>
    </>
  );
}

/** Alta (POST) o edición (PATCH, con `initial`). En edición la acción no se toca: eso va por CLI/API. */
function CronForm({
  agents,
  machines,
  initial,
  onCancel,
  onSaved,
}: {
  agents: Agent[];
  /** Máquinas del usuario: un comando puede correr con la configuración de una (su env y secretos). */
  machines: Agent[];
  initial?: UserCron;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const editing = !!initial;
  // Buzones de eventos de la cuenta, para mandar ahí el resultado de cada ejecución.
  const [inboxes, setInboxes] = useState<{ id: string; name: string }[]>([]);
  // Nombres de la bóveda (los valores nunca salen). Los acotados a un cron o máquina (`__C_`/`__M_`) no se ofrecen.
  const [vault, setVault] = useState<string[]>([]);
  useEffect(() => {
    api("/api/v2/inboxes")
      .then((r: { items?: { id: string; name: string }[] }) => setInboxes(r.items ?? []))
      .catch(() => undefined);
    if (!editing) {
      api("/api/v2/secrets")
        .then((r: { items?: { name: string }[] }) => setVault((r.items ?? []).map((s) => s.name).filter((n) => !isInternalSecretName(n))))
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
  const [machine, setMachine] = useState("");
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
                  ...(machine ? { machine } : {}),
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
      className={`grid gap-4 md:grid-cols-2 ${editing ? "text-left" : "mb-6 rounded-3xl bg-white p-5 ring-1 ring-black/10 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)] md:p-6"}`}
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
          <>Se ejecuta una vez y se apaga · zona {timezone}</>
        ) : (
          <>
            <span className="font-mono">{cron || "—"}</span> · zona {timezone} · mínimo cada 5 minutos
          </>
        )}
      </p>

      {editing ? (
        <p className="md:col-span-2 rounded-xl bg-gray-100 p-3 text-xs text-gray-600">
          La acción no se edita desde el panel. Para cambiarla usa la API (<code className="font-mono">PATCH /api/v2/crons/{initial!.id}</code>{" "}
          con <code className="font-mono">action</code>) o la CLI: borra este cron y créalo de nuevo con{" "}
          <code className="font-mono">easybits crons create … --run …</code>.
        </p>
      ) : (
        <>
          <div className="md:col-span-2">
            <label className={label}>Qué hace</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["http", "Pegarle a una URL", true],
                  ["agent_turn", agents.length ? "Escribirle a un agente" : "Escribirle a un agente (no tienes)", agents.length > 0],
                  ["exec", "Ejecutar un comando", true],
                ] as const
              ).map(([k, text, enabled]) => {
                const Icon = KIND[k].icon;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`flex items-center gap-3 rounded-2xl p-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      kind === k ? "bg-brand-100 ring-2 ring-brand-500" : "bg-white ring-1 ring-gray-200 hover:ring-gray-300"
                    }`}
                  >
                    <Icon className="shrink-0 text-2xl" /> {text}
                  </button>
                );
              })}
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
              {machines.length > 0 && (
                <div className="md:col-span-2">
                  <label className={label}>Con la configuración de</label>
                  <select className={input} value={machine} onChange={(e) => setMachine(e.target.value)}>
                    <option value="">Ninguna máquina (sólo los secretos que elijas)</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    El comando recibe el entorno y los secretos de esa app (su base de datos incluida) en cada ejecución, sin copiarlos.
                  </p>
                </div>
              )}
              <div className="md:col-span-2">
                <label className={label}>Secretos como variables</label>
                {vault.length ? (
                  <SecretPicker names={vault} value={execSecrets} onChange={setExecSecrets} />
                ) : (
                  <p className="text-xs text-gray-500">
                    Tu bóveda está vacía (<a className="underline" href="/dash/developer/secrets">Secretos</a>).
                  </p>
                )}
              </div>
              <p className="md:col-span-2 -mt-2 text-xs text-gray-500">
                Se ejecuta en una caja nueva que se destruye al terminar; éxito = exit 0. Para archivos y llaves sólo de este cron usa la
                CLI: <code className="font-mono">easybits crons create … --run … --file … --secret-file NOMBRE:ruta</code>.
              </p>
            </>
          )}
        </>
      )}

      <fieldset className="md:col-span-2">
        <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700">
          <PiBellRingingBold className="text-base" /> Avisarme
        </legend>
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-black/10">
          <SwitchRow
            icon={PiDeviceMobileDuotone}
            title="Push a la app de Ghosty"
            hint="Usa el secreto GHOSTY_PUSH_TOKEN de tu bóveda (token personal de la app)."
            checked={notifyPush}
            onChange={setNotifyPush}
          />
          <SwitchRow icon={PiEnvelopeSimpleDuotone} title="Correo" hint="Al correo de tu cuenta." checked={notifyEmail} onChange={setNotifyEmail} />
          {inboxes.length > 0 && (
            <li className="flex items-center gap-3 px-4 py-3">
              <PiTrayDuotone className="shrink-0 text-xl text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Buzón</p>
                <p className="text-xs text-gray-500">Deja cada resultado en uno de tus buzones de eventos.</p>
              </div>
              <select
                aria-label="Buzón"
                className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
                value={notifyInbox}
                onChange={(e) => setNotifyInbox(e.target.value)}
              >
                <option value="">Ninguno</option>
                {inboxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </li>
          )}
          <SwitchRow
            icon={PiCheckCircleDuotone}
            title="También cuando sale bien"
            hint={notifyPush || notifyEmail || notifyInbox ? "Apagado, sólo te avisa cuando falla." : "Elige primero dónde avisarte."}
            checked={notifyAlways}
            onChange={setNotifyAlways}
            disabled={!(notifyPush || notifyEmail || notifyInbox)}
          />
        </ul>
      </fieldset>

      {error && <p className="md:col-span-2 text-sm font-bold text-brand-red">{error}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-full px-4 text-sm font-semibold text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-full bg-black px-5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cron"}
        </button>
      </div>
    </form>
  );
}
