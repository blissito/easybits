import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";

// «Mis crons»: los crons de la cuenta de quien mira (userCronOperations.ts). Habla directo con
// la REST /api/v2/crons (la sesión del panel vale como auth), así que lo que se hace aquí es
// exactamente lo que hace un agente por API/MCP.

type Action =
  | { type: "http"; url: string; method: string; body?: string; secretName?: string; secretHeader?: string }
  | { type: "agent_turn"; fleetAgentId: string; prompt: string; groupId?: string };

type UserCron = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  schedule: string;
  enabled: boolean;
  action: Action;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
  failCount: number;
};
type Agent = { id: string; name: string };

const DEFAULT_TZ = "America/Mexico_City";
const DAYS = [
  ["1", "lunes"],
  ["2", "martes"],
  ["3", "miércoles"],
  ["4", "jueves"],
  ["5", "viernes"],
  ["6", "sábado"],
  ["0", "domingo"],
] as const;

type When = { mode: "daily" | "weekdays" | "weekly" | "every" | "custom"; time: string; day: string; every: string; cron: string };

/** Lo que el usuario eligió en palabras → cron de 5 campos. */
function toCron(w: When): string {
  const [h, m] = (w.time || "08:30").split(":").map((n) => String(Number(n)));
  if (w.mode === "daily") return `${m} ${h} * * *`;
  if (w.mode === "weekdays") return `${m} ${h} * * 1-5`;
  if (w.mode === "weekly") return `${m} ${h} * * ${w.day}`;
  if (w.mode === "every") return w.every === "60" ? "0 * * * *" : `*/${w.every} * * * *`;
  return w.cron.trim();
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

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
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
            Tareas programadas de tu cuenta: le pegan a una URL o le mandan un mensaje a uno de tus agentes. También por
            API (<code className="font-mono text-xs">/api/v2/crons</code>), MCP (<code className="font-mono text-xs">create_cron</code>) o el
            copiloto.
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
          onCreated={async () => {
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
                  : `turno a «${agents.find((a) => a.id === (c.action as { fleetAgentId: string }).fleetAgentId)?.name ?? "agente"}»`;
              return (
                <tr key={c.id} className="border-t border-gray-200 align-top">
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
                  <td className="p-3 whitespace-nowrap max-md:hidden" suppressHydrationWarning>
                    {c.enabled ? relative(c.nextRunAt) : "en pausa"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      <BrutalButton type="button" size="chip" mode="ghost" isDisabled={!!busy} onClick={() => act(c.id, "run")}>
                        {busy === `${c.id}:run` ? "…" : "Ejecutar"}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CronForm({ agents, onCancel, onCreated }: { agents: Agent[]; onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [when, setWhen] = useState<When>({ mode: "daily", time: "08:30", day: "1", every: "15", cron: "" });
  const [timezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
    } catch {
      return DEFAULT_TZ;
    }
  });
  const [kind, setKind] = useState<"http" | "agent_turn">("http");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretHeader, setSecretHeader] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cron = toCron(when);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const action =
      kind === "http"
        ? {
            type: "http",
            url,
            method,
            ...(body ? { body } : {}),
            ...(secretName ? { secretName, ...(secretHeader ? { secretHeader } : {}) } : {}),
          }
        : { type: "agent_turn", fleetAgentId: agentId || agents[0]?.id, prompt };
    try {
      await api("/api/v2/crons", { method: "POST", body: JSON.stringify({ name, cron, timezone, action }) });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<When>) => setWhen((w) => ({ ...w, ...patch }));

  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-xl border-2 border-black p-4 shadow-[3px_3px_0_#000] md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={label}>Nombre</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Despertador de estudio" required />
      </div>

      <div>
        <label className={label}>Cuándo</label>
        <select className={input} value={when.mode} onChange={(e) => set({ mode: e.target.value as When["mode"] })}>
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
      <p className="md:col-span-2 -mt-2 text-xs text-gray-500">
        <span className="font-mono">{cron || "—"}</span> · zona {timezone} · mínimo cada 5 minutos
      </p>

      <div className="md:col-span-2">
        <label className={label}>Qué hace</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={kind === "http"} onChange={() => setKind("http")} /> Pegarle a una URL
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={kind === "agent_turn"} onChange={() => setKind("agent_turn")} disabled={!agents.length} />
            Mandarle un mensaje a un agente{!agents.length && " (no tienes agentes)"}
          </label>
        </div>
      </div>

      {kind === "http" ? (
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
      ) : (
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

      {error && <p className="md:col-span-2 text-sm font-bold text-red-600">{error}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <BrutalButton type="button" mode="ghost" onClick={onCancel}>
          Cancelar
        </BrutalButton>
        <BrutalButton type="submit" mode="brand" isDisabled={saving}>
          {saving ? "Creando…" : "Crear cron"}
        </BrutalButton>
      </div>
    </form>
  );
}
