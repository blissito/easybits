// Botón «Tema» del editor de sitios (port del de ghosty.studio): paletas de la casa y de la
// comunidad en Claros/Oscuros, más «Personalizado» a partir del tema actual. Sin modelo: la
// vista previa cambia en vivo (`onPreview` → eb-picker.js) y el servidor reescribe el archivo
// de tema del sitio (`/api/v2/sites/:id/theme`). Un sitio anterior a los temas ofrece «Adaptar».
import { useEffect, useRef, useState } from "react";
import { LuPalette } from "react-icons/lu";
import { SITE_THEMES, type ThemeColors } from "~/lib/siteTheme";
import { customizeColors, luminance } from "~/lib/landing3/communityThemes";

const GROUPS = [
  { label: "Claros", themes: SITE_THEMES.filter((t) => luminance(t.colors.surface) > 0.4) },
  { label: "Oscuros", themes: SITE_THEMES.filter((t) => luminance(t.colors.surface) <= 0.4) },
];

type State = { supported: boolean; colors: ThemeColors | null } | null;

export function ThemePicker({
  siteId,
  disabled,
  onPreview,
  onAdapt,
}: {
  siteId: string;
  disabled?: boolean;
  onPreview: (colors: ThemeColors) => void;
  onAdapt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const url = `/api/v2/sites/${siteId}/theme`;

  // Al abrir se lee el tema real del sitio (el archivo manda; puede haberlo cambiado el agente).
  useEffect(() => {
    if (!open) return;
    setState(null);
    setError(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setState)
      .catch(() => setError("No se pudo leer el tema del sitio."));
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const save = async (body: { themeId: string } | { colors: ThemeColors }, key: string) => {
    setBusy(key);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(null);
    if (!r?.ok || !j?.colors) {
      setError(j?.message || "No se guardó el tema. Intenta otra vez.");
      return null;
    }
    setError(null);
    setState({ supported: true, colors: j.colors });
    return j.colors as ThemeColors;
  };

  const pick = async (id: string, colors: ThemeColors) => {
    onPreview(colors);
    await save({ themeId: id }, id);
  };

  // «Personalizado»: en vivo al mover el color; se guarda ~0.6 s después del último.
  const timer = useRef<number | null>(null);
  const custom = (k: "primary" | "accent" | "surface", v: string) => {
    if (!state?.colors) return;
    const colors = customizeColors(state.colors, { [k]: v }) as ThemeColors;
    setState({ supported: true, colors });
    onPreview(colors);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save({ colors }, "custom"), 600);
  };

  const current = state?.colors;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={disabled ? "Espera a que el agente termine" : "Cambia los colores del sitio"}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border-2 disabled:opacity-40 ${open ? "border-brand-500 text-brand-500 bg-brand-500/10" : "border-gray-200 text-gray-500 hover:text-black"}`}
      >
        <LuPalette className="h-4 w-4" />
        <span className="text-xs font-bold">Tema</span>
      </button>
      {/* fixed: la barra de la vista previa tiene overflow-x y recortaría un absolute. */}
      {open && (
        <div className="fixed right-4 top-24 z-50 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-2 border-black bg-white p-2 shadow-[4px_4px_0_#000] whitespace-normal">
          {error && <p className="mx-1 mb-1 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</p>}
          {!state && !error && <p className="px-2 py-3 text-xs text-gray-500">Leyendo el tema…</p>}
          {state && !state.supported && (
            <div className="px-2 py-2 text-xs">
              <p className="font-bold mb-1">Este sitio se hizo antes de los temas</p>
              <p className="text-gray-500 mb-2">Sus colores están escritos a mano. El agente puede pasarlos a tokens (un turno) y desde ahí cambias el tema con un clic.</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAdapt();
                }}
                className="px-3 py-1.5 rounded-lg bg-black text-white font-bold"
              >
                Adaptar a temas
              </button>
            </div>
          )}
          {state?.supported &&
            GROUPS.map((g) => (
              <div key={g.label} className="mb-1">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{g.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {g.themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!!busy}
                      onClick={() => void pick(t.id, t.colors)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-100 disabled:opacity-60 ${current?.primary === t.colors.primary && current?.surface === t.colors.surface ? "ring-1 ring-black" : ""}`}
                    >
                      <span className="flex shrink-0 overflow-hidden rounded-full border border-gray-200">
                        {[t.colors.surface, t.colors.primary, t.colors.accent].map((c, i) => (
                          <span key={i} className="h-4 w-3" style={{ background: c }} />
                        ))}
                      </span>
                      <span className="truncate">{busy === t.id ? "Aplicando…" : t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {state?.supported && current && (
            <div className="mt-1 border-t border-gray-200 pt-1">
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Personalizado</p>
              <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                {(
                  [
                    ["primary", "Principal"],
                    ["accent", "Acento"],
                    ["surface", "Fondo"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] hover:bg-gray-100">
                    <input
                      type="color"
                      value={current[k]}
                      onChange={(e) => custom(k, e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded border border-gray-200 bg-transparent p-0"
                    />
                    {l}
                  </label>
                ))}
              </div>
              {busy === "custom" && <p className="px-2 pb-1 text-[11px] text-gray-400">Guardando…</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
