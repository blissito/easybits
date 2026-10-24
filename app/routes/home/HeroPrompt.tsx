import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LuArrowUp } from "react-icons/lu";
import { ModelPill, useEngines, type ModelPick } from "~/components/sitios/ModelPill";
import { AgentArt, BookingArt, FinanceArt, GymArt, InvoiceArt } from "./heroIllustrations";

/**
 * Prompt del hero. Al enviar se crea el sitio (`POST /api/v2/sites`) y se navega a su editor
 * con una View Transition: el cuadro de texto sube y se convierte en el primer mensaje del chat
 * (mismo `view-transition-name` que la primera burbuja del editor). El editor manda el turno
 * solo (`?prompt=`). Sin sesión, el prompt viaja por el login a /dash/sitios/new.
 */

// Apps que ya hemos construido con clientes (base de datos + backend), con su nombre real.
// Evitar la palabra «app» fuera de la de finanzas: templateFor la usa para la plantilla de muestra.
const CHIPS = [
  {
    Art: GymArt,
    label: "Administrador de gimnasio",
    prompt: "Administrador de gimnasio: aplicación fullstack con base de datos y login.",
  },
  {
    Art: FinanceArt,
    label: "App para mis finanzas",
    prompt: "App para mis finanzas: aplicación fullstack con base de datos y login.",
  },
  {
    Art: InvoiceArt,
    label: "Reemplazo de Aspel y Compaq",
    prompt: "Reemplazo de Aspel y Compaq: aplicación fullstack con base de datos y login.",
  },
  {
    Art: BookingArt,
    label: "Aplicación de reservas",
    prompt: "Aplicación de reservas: aplicación fullstack con base de datos y login.",
  },
  {
    Art: AgentArt,
    label: "Agente de IA",
    prompt: "Agente de IA: aplicación fullstack con base de datos y login.",
  },
];

export function HeroPrompt({ loggedIn }: { loggedIn: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // «Continuar»: el último sitio de la persona. El editor se re-engancha solo al turno en curso.
  const [lastSite, setLastSite] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/v2/sites")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items?.[0] && setLastSite({ id: d.items[0].id, name: d.items[0].name }))
      .catch(() => {});
  }, [loggedIn]);
  // Con qué se construye: el mismo default que el servidor (tu Claude si ya tienes llave; si no, el de la casa).
  const { engines } = useEngines(loggedIn);
  const [pick, setPick] = useState<ModelPick | null>(null);
  const defaultEngine = engines?.find((e) => e.id === "claude" && !e.needsSecret) ?? engines?.find((e) => e.included) ?? engines?.[0];
  const chosen = pick ?? (defaultEngine ? { engine: defaultEngine.id, model: null } : null);

  async function submit(value: string) {
    const clean = value.trim();
    if (!clean || sending) return;
    setText(clean);
    setError(null);
    const next = `/dash/sitios/new?kind=webapp&prompt=${encodeURIComponent(clean)}`;
    if (!loggedIn) return navigate(`/login?next=${encodeURIComponent(next)}`);
    setSending(true);
    try {
      const res = await fetch("/api/v2/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean, ...(pick ?? {}) }),
      });
      if (res.status === 401) return navigate(`/login?next=${encodeURIComponent(next)}`);
      const created = await res.json().catch(() => null);
      if (!res.ok || !created?.id) throw new Error(created?.error || `Error ${res.status}`);
      navigate(`/dash/sitios/${created.id}?prompt=${encodeURIComponent(clean)}`, { viewTransition: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "error de red");
      setSending(false);
    }
  }

  return (
    <div className="w-full max-w-xl text-left">
      {/* Una sola entrada: el prompt. Los ejemplos sólo lo disparan con un clic. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        style={{ viewTransitionName: sending ? "eb-prompt" : undefined }}
        className="w-full rounded-2xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000] focus-within:shadow-[6px_6px_0_0_#9870ED] transition-shadow"
      >
        <label htmlFor="hero-prompt" className="sr-only">
          Describe la aplicación que quieres
        </label>
        <textarea
          id="hero-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía, Shift+Enter salta de línea.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={3}
          placeholder="Quiero una aplicación con base de datos y login para mi negocio de…"
          className="block w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pt-4 pb-1 text-base md:text-lg shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 placeholder:text-gray-400"
        />
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div>{engines && chosen && <ModelPill engines={engines} value={chosen} onPick={(p) => setPick(p)} />}</div>
          <button
            id="EmpezarGratisHome"
            type="submit"
            disabled={!text.trim() || sending}
            className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-500 px-4 py-2 font-bold text-black shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {sending ? "Preparando tu caja…" : "Construir"} <LuArrowUp className="size-4" />
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
        {lastSite && (
          <a
            href={`/dash/sitios/${lastSite.id}`}
            className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-black bg-brand-500 py-1 pl-3 pr-3 text-sm font-bold shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            <span className="truncate">Continuar «{lastSite.name}»</span> →
          </a>
        )}
        {CHIPS.map(({ Art, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => submit(prompt)}
            className="group flex items-center gap-2 rounded-full border-2 border-black bg-white py-1 pl-1 pr-3 text-sm font-bold shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 hover:bg-brand-500/10 active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:shadow-[3px_3px_0_0_#9870ED]"
          >
            <Art className="size-7 shrink-0 transition-transform group-hover:-rotate-6" />
            {label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm font-bold text-red-600">⚠️ {error}</p>}
    </div>
  );
}
