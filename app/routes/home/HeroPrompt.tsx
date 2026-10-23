import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowUp, LuX, LuExternalLink } from "react-icons/lu";
import { AgentArt, BookingArt, FinanceArt, GymArt, InvoiceArt } from "./heroIllustrations";
import { templateFor, templateHtml } from "./heroTemplates";
import { BotMessage, UserMessage, applyTurnEvent, type Msg } from "~/components/sitios/ChatMessages";
import { AgentComputer, requestTakeover } from "~/components/sitios/AgentComputer";

/**
 * Prompt del hero. Al enviar, la caja se transforma (layoutId, sin cambiar de ruta)
 * en el chat del creador de sitios: con sesión crea un sitio estático
 * (`POST /api/v2/sites`) y corre el primer turno aquí mismo, con la vista previa al
 * lado; sin sesión, el chat pide entrar y el prompt viaja a /dash/sitios/new.
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

const EMPTY_BOT: Msg = { role: "bot", text: "", tools: [] };

type Phase = "idle" | "creating" | "running" | "done" | "auth" | "error";
type Site = { id: string; name: string; kind: "static" | "webapp"; previewUrl: string | null; editorUrl: string };

export function HeroPrompt({ loggedIn }: { loggedIn: boolean }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  // La respuesta del agente: mismo mensaje y mismo formato que el editor (ChatMessages).
  const [bot, setBot] = useState<Msg>(EMPTY_BOT);
  const say = (text: string, extra: Partial<Msg> = {}) => setBot((p) => ({ ...p, text, ...extra }));
  const tools = bot.tools?.length ?? 0;
  const [site, setSite] = useState<Site | null>(null);
  const [pane, setPane] = useState<"preview" | "computer">("preview");
  const [previewKey, setPreviewKey] = useState(0);
  // La caja responde en su servidor de desarrollo: hasta entonces se ve la plantilla de muestra.
  const [previewReady, setPreviewReady] = useState(false);
  const reduce = useReducedMotion();
  const open = phase !== "idle";
  const working = phase === "creating" || phase === "running";
  // La primera vez que el agente abre el navegador, el panel salta a su computadora (como
  // Manus); si el visitante ya eligió pestaña, se respeta.
  const paneTouched = useRef(false);
  const hasBrowser = !!bot.steps?.some((s) => s.browser);
  useEffect(() => {
    if (hasBrowser && !paneTouched.current) setPane("computer");
  }, [hasBrowser]);
  // La vista previa se recarga con el trabajo del agente, pero no más de una vez cada 6 s.
  const lastReload = useRef(0);
  const siteRef = useRef<Site | null>(null);
  siteRef.current = site;
  const reloadPreview = useCallback(() => {
    if (Date.now() - lastReload.current < 6000) return;
    lastReload.current = Date.now();
    setPreviewKey((k) => k + 1);
  }, []);

  const close = useCallback(() => {
    // Un turno en curso sigue en el servidor; el sitio queda en /dash/sitios.
    setPhase("idle");
    setBot(EMPTY_BOT);
    setSite(null);
    setPreviewReady(false);
  }, []);

  // Sondea la vista previa de la caja hasta que responda (nace de la dorada en ~5 s).
  useEffect(() => {
    if (!site || site.kind !== "webapp" || previewReady) return;
    let stop = false;
    const poll = async () => {
      const r = await fetch(`/api/v2/sites/${site.id}/chat?preview=1`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!stop && r?.ready) setPreviewReady(true);
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [site, previewReady]);

  // Todo modal cierra con ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  /** Aplica un evento SSE del turno; true = evento final. */
  const apply = useCallback((e: { type: string; [k: string]: any }) => {
    setBot((p) => applyTurnEvent(p, e).msg);
    // La web app se ve en vivo (recarga en caliente de su servidor dev); el estático hay que recargarlo.
    if (e.type === "tool" && e.phase === "start" && siteRef.current?.kind !== "webapp") reloadPreview();
    return ["done", "error", "capacity", "interrupted", "idle"].includes(e.type);
  }, [reloadPreview]);

  const consume = useCallback(
    async (res: Response) => {
      if (!res.body) return false;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) return false;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const dl = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data: "));
          buf = buf.slice(nl + 2);
          if (!dl) continue;
          try {
            if (apply(JSON.parse(dl.slice(6)))) return true;
          } catch {
            /* evento malformado */
          }
        }
      }
    },
    [apply]
  );

  async function submit(value: string) {
    const clean = value.trim();
    if (!clean || open) return;
    setSent(clean);
    setText("");
    if (!loggedIn) return setPhase("auth");
    setPhase("creating");
    try {
      const res = await fetch("/api/v2/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean }),
      });
      if (res.status === 401) return setPhase("auth");
      const created = await res.json().catch(() => null);
      if (!res.ok || !created?.id) {
        say(`⚠️ ${created?.error || `Error ${res.status}`}`);
        return setPhase("error");
      }
      setSite(created);
      setPhase("running");
      const body = JSON.stringify({ text: clean, turnId: crypto.randomUUID() });
      const url = `/api/v2/sites/${created.id}/chat`;
      // 503 = la instancia se apaga por un deploy: el reintento (mismo turnId) cae en la nueva.
      let chat = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      for (let i = 0; i < 10 && chat.status === 503; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        chat = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      }
      if (chat.status === 402) {
        say("Se acabaron tus tokens LLM.", { quota: true });
        return setPhase("done");
      }
      if (!chat.ok) {
        const err = await chat.json().catch(() => null);
        say(`⚠️ ${err?.message || `Error ${chat.status}`}`);
        return setPhase("done");
      }
      let finished = await consume(chat).catch(() => false);
      // El turno vive en el servidor: si el stream se cortó, nos re-enganchamos.
      for (let i = 0; !finished && i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const again = await fetch(`${url}?attach=1`).catch(() => null);
        if (again?.ok) finished = await consume(again).catch(() => false);
      }
      setPhase("done");
      if (created.kind !== "webapp") setPreviewKey((k) => k + 1);
    } catch (err) {
      say(`⚠️ ${err instanceof Error ? err.message : "error de red"}`);
      setPhase("error");
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/dash/sitios/new?kind=webapp&prompt=${encodeURIComponent(sent)}`)}`;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <LayoutGroup>
      {/* Reserva el alto del bloque mientras está abierto el chat: el hero no salta. */}
      <div className="w-full max-w-xl">
        {!open && (
          <motion.div layoutId="eb-generator" transition={spring} className="w-full text-left">
            {/* Una sola entrada: el prompt. Los ejemplos sólo lo disparan con un clic. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(text);
              }}
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
              <div className="flex justify-end px-4 pb-3">
                <button
                  id="EmpezarGratisHome"
                  type="submit"
                  disabled={!text.trim()}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-500 px-4 py-2 font-bold text-black shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  Construir <LuArrowUp className="size-4" />
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
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
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-white/70 backdrop-blur-sm"
            onClick={close}
          />
        )}
      </AnimatePresence>

      {open && (
        <motion.section
          layoutId="eb-generator"
          transition={spring}
          role="dialog"
          aria-modal="true"
          aria-label="Creador de sitios"
          className="fixed inset-3 md:inset-8 z-50 flex flex-col overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[8px_8px_0_0_#000] text-left"
        >
          <motion.header
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.25 } }}
            className="flex items-center gap-3 border-b-2 border-black px-4 py-3"
          >
            <img src="/logo-purple.svg" alt="" className="h-6" />
            <span className="font-bold truncate">{site?.name ?? "Nuevo sitio"}</span>
            <span className="ml-auto" />
            {site && (
              <a
                href={site.editorUrl}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border-2 border-black px-3 py-1 text-sm font-bold hover:bg-brand-500/15"
              >
                Abrir en el editor <LuExternalLink className="size-4" />
              </a>
            )}
            <button type="button" onClick={close} aria-label="Cerrar" className="rounded-lg p-1 hover:bg-gray-100">
              <LuX className="size-5" />
            </button>
          </motion.header>

          <div className="flex min-h-0 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: reduce ? 0 : 0.3 } }}
              className="flex w-full md:w-[38%] md:min-w-[320px] md:max-w-md md:shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 md:border-r-2 md:border-black"
            >
              <UserMessage msg={{ role: "user", text: sent }} />
              {phase === "auth" ? (
                <AuthPrompt href={loginHref} />
              ) : (
                <BotMessage msg={bot} live={phase === "creating" || phase === "running"} />
              )}
              {phase === "done" && site && (
                <a href={site.editorUrl} className="self-start rounded-lg border-2 border-black bg-white px-3 py-1.5 text-sm font-bold shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5">
                  Seguir en el editor →
                </a>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.35 } }}
              className="hidden md:flex min-w-0 flex-1 flex-col gap-3 bg-gray-50 p-4"
            >
              {/* Vista previa de la app o «la computadora del agente» (lo que hace, paso a paso). */}
              <div role="tablist" className="flex gap-2">
                {(
                  [
                    ["preview", "Vista previa"],
                    ["computer", "Computadora del agente"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    type="button"
                    aria-selected={pane === k}
                    onClick={() => {
                      paneTouched.current = true;
                      setPane(k);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1 text-sm font-bold transition-all ${pane === k ? "border-black bg-white shadow-[3px_3px_0_0_#000]" : "border-transparent text-gray-500 hover:text-black"}`}
                  >
                    {k === "computer" && working && <span className="size-2 animate-pulse rounded-full bg-green-500" />}
                    {label}
                    {k === "computer" && (bot.steps?.length ?? 0) > 0 && <span className="font-mono text-xs text-gray-400">{bot.steps!.length}</span>}
                  </button>
                ))}
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-black bg-white">
                {pane === "computer" ? (
                  <AgentComputer steps={bot.steps ?? []} live={working} onTakeover={site ? (sid) => requestTakeover(site.id, sid) : undefined} />
                ) : site?.previewUrl && (site.kind === "webapp" ? previewReady : tools > 0) ? (
                  <iframe key={previewKey} src={site.previewUrl} title="Vista previa" className="h-full w-full" />
                ) : (
                  <TemplatePreview prompt={sent} />
                )}
              </div>
            </motion.div>
          </div>
        </motion.section>
      )}
    </LayoutGroup>
  );
}

/** Sin sesión: el agente no corre; el mensaje pide entrar y el prompt viaja al login. */
function AuthPrompt({ href }: { href: string }) {
  return (
    <div className="text-[15px] leading-6 text-gray-900">
      <p>Para construirlo necesito que entres a tu cuenta. Es gratis y tu mensaje te espera del otro lado.</p>
      <a href={href} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-500 px-4 py-2 font-bold shadow-[3px_3px_0_0_#000]">
        Entrar y construir →
      </a>
    </div>
  );
}

/** Plantilla de muestra según el prompt, hasta que el agente escriba el primer archivo. */
function TemplatePreview({ prompt }: { prompt: string }) {
  return (
    <div className="flex h-full flex-col">
      {/* Barra propia: la etiqueta nunca se encima con el nav del sitio. */}
      <div className="flex items-center gap-2 border-b-2 border-black bg-white px-3 py-1.5">
        <span className="size-2.5 rounded-full bg-brand-500" />
        <span className="text-xs font-bold">Ejemplo</span>
        <span className="text-xs text-gray-500">· tu sitio aparece aquí</span>
      </div>
      <iframe srcDoc={templateHtml(templateFor(prompt))} title="Ejemplo de sitio" sandbox="" className="min-h-0 w-full flex-1" />
    </div>
  );
}
