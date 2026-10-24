import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuCheck } from "react-icons/lu";

/**
 * Con qué se construye: motor + modelo, siempre a la vista y cambiable desde aquí. El modelo es del
 * builder de la cuenta (uno por motor), así que el cambio vale para todos los sitios de ese motor.
 * Lee `GET /api/v2/sites/engines`; quien la monta decide qué hacer con la elección (`onPick`): el
 * home la guarda para crear el sitio y el editor la aplica con `POST /api/v2/sites/:id/engine`.
 */

export type EngineChoice = {
  id: string;
  label: string;
  included: boolean;
  needsSecret: boolean;
  secretPlaceholder: string;
  secretKind: string | null;
  models: { id: string; label: string; ready?: boolean }[];
  currentModel: string | null;
};
export type ModelPick = { engine: string; model: string | null; secretValue?: string };

const short = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

export function modelLabel(engines: EngineChoice[], pick: { engine: string; model: string | null }) {
  const e = engines.find((x) => x.id === pick.engine);
  if (!e) return null;
  const m = e.models.find((x) => x.id === (pick.model ?? e.currentModel));
  return `${m ? short(m.label) : e.label} · ${e.included ? "EasyBits" : `tu ${e.label}`}`;
}

export function useEngines(enabled = true) {
  const [engines, setEngines] = useState<EngineChoice[] | null>(null);
  const reload = () =>
    fetch("/api/v2/sites/engines")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items && setEngines(d.items))
      .catch(() => {});
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled]);
  return { engines, reload };
}

export function ModelPill({
  engines,
  value,
  onPick,
  busy,
  error,
}: {
  engines: EngineChoice[];
  value: { engine: string; model: string | null };
  onPick: (pick: ModelPick) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Motor que pide llave: se escribe aquí mismo antes de elegirlo.
  const [askKey, setAskKey] = useState<{ engine: string; model: string | null } | null>(null);
  const [key, setKey] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setAskKey(null);
  }, [open]);

  const current = engines.find((e) => e.id === value.engine);
  const currentModel = value.model ?? current?.currentModel ?? null;
  const pick = async (engine: EngineChoice, model: string | null) => {
    if (engine.needsSecret) {
      setAskKey({ engine: engine.id, model });
      setKey("");
      return;
    }
    await onPick({ engine: engine.id, model });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Con qué modelo se construye"
        className="flex items-center gap-1 rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-bold shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[3px_3px_0_0_#9870ED]"
      >
        {busy ? "Cambiando…" : (modelLabel(engines, value) ?? "Modelo")}
        <LuChevronDown className="size-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border-2 border-black bg-white p-2 text-left shadow-[4px_4px_0_0_#000]">
          {engines.map((e) => (
            <div key={e.id} className="py-1">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {e.label} {e.included ? "· incluido" : e.needsSecret ? "· pide tu llave" : "· tu cuenta"}
              </p>
              {e.models.map((m) => {
                const on = e.id === value.engine && m.id === currentModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    disabled={m.ready === false}
                    onClick={() => pick(e, m.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-brand-500/10 disabled:opacity-40 ${on ? "font-bold" : ""}`}
                  >
                    {m.label}
                    {on && <LuCheck className="size-4" />}
                  </button>
                );
              })}
              {askKey?.engine === e.id && (
                <form
                  className="mt-1 flex gap-1 px-2"
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    if (!key.trim()) return;
                    await onPick({ engine: e.id, model: askKey.model, secretValue: key.trim() });
                    setOpen(false);
                  }}
                >
                  <input
                    autoFocus
                    type="password"
                    value={key}
                    onChange={(ev) => setKey(ev.target.value)}
                    placeholder={e.secretPlaceholder || "Tu llave"}
                    className="min-w-0 flex-1 rounded-lg border-2 border-black px-2 py-1 text-xs"
                  />
                  <button type="submit" className="rounded-lg border-2 border-black bg-brand-500 px-2 text-xs font-bold">
                    Usar
                  </button>
                </form>
              )}
            </div>
          ))}
          {current && <p className="border-t border-gray-200 px-2 pt-2 text-[11px] text-gray-500">El modelo vale para todos tus sitios con {current.label}, desde el siguiente mensaje.</p>}
          {error && <p className="px-2 pt-1 text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
