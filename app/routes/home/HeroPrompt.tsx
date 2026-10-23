import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowUp, LuChevronDown, LuPencilLine, LuX, LuExternalLink } from "react-icons/lu";
import { AgentArt, BookingArt, FinanceArt, GymArt, InvoiceArt } from "./heroIllustrations";
import { templateFor, templateHtml } from "./heroTemplates";
import { SITE_TEMPLATES, type SiteTemplateKey } from "~/lib/siteTemplates";
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

// Texto con el que abre «O descríbelo tú»: el visitante sólo completa su negocio.
const CUSTOM_PREFILL = "Quiero una aplicación con base de datos y login para ";

const templateLabel = (k: SiteTemplateKey) => SITE_TEMPLATES.find((t) => t.key === k)!.label;

const EMPTY_BOT: Msg = { role: "bot", text: "", tools: [] };

type Phase = "idle" | "creating" | "running" | "done" | "auth" | "error";
type Site = { id: string; name: string; kind: "static" | "webapp"; previewUrl: string | null; editorUrl: string };

export function HeroPrompt({ loggedIn }: { loggedIn: boolean }) {
  const [text, setText] = useState("");
  // Botones primero: el textarea sólo aparece si el visitante quiere describir lo suyo.
  const [custom, setCustom] = useState(false);
  // Plantilla del select (sin elegir = null). La que realmente se mandó vive en sentTemplate.
  const [template, setTemplate] = useState<SiteTemplateKey | null>(null);
  const [sentTemplate, setSentTemplate] = useState<SiteTemplateKey | null>(null);
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

  async function submit(value: string, chosen?: SiteTemplateKey) {
    const clean = value.trim();
    if (!clean || open) return;
    setSent(clean);
    setText("");
    setSentTemplate(chosen ?? null);
    if (!loggedIn) return setPhase("auth");
    setPhase("creating");
    try {
      const res = await fetch("/api/v2/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean, ...(chosen && { template: chosen }) }),
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

  const loginHref = `/login?next=${encodeURIComponent(`/dash/sitios/new?kind=webapp&prompt=${encodeURIComponent(sent)}${sentTemplate ? `&template=${sentTemplate}` : ""}`)}`;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <LayoutGroup>
      {/* Reserva el alto del bloque mientras está abierto el chat: el hero no salta. */}
      <div className="w-full max-w-xl min-h-[420px]">
        {!open && (
          <motion.div layoutId="eb-generator" transition={spring} className="w-full text-left">
            <AnimatePresence mode="wait" initial={false}>
              {!custom ? (
                <motion.div
                  key="examples"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: reduce ? 0 : 0.22 }}
                >
                  <p className="mb-3 text-base font-bold text-center md:text-left">
                    Elige una aplicación fullstack de ejemplo y un agente la construye frente a ti:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CHIPS.map(({ Art, label, prompt }, i) => (
                      <button
                        key={label}
                        id={i === 0 ? "EmpezarGratisHome" : undefined}
                        type="button"
                        onClick={() => submit(prompt)}
                        className={`group flex items-center gap-3 rounded-2xl border-2 border-black bg-white p-3 text-left shadow-[4px_4px_0_0_#000] transition-all hover:-translate-y-0.5 hover:bg-brand-500/10 hover:shadow-[6px_6px_0_0_#000] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:shadow-[6px_6px_0_0_#9870ED] ${i === CHIPS.length - 1 ? "sm:col-span-2" : ""}`}
                      >
                        <Art className="size-12 md:size-14 shrink-0 transition-transform group-hover:-rotate-6" />
                        <span className="font-bold leading-tight md:text-lg">{label}</span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-6 mb-2 text-base font-bold text-center md:text-left">O empieza desde una plantilla:</p>
                  <TemplateSelect
                    value={template}
                    onChange={setTemplate}
                    onBuild={(t) => submit(`Aplicación fullstack con base de datos y login, a partir de la plantilla «${templateLabel(t)}».`, t)}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setText(CUSTOM_PREFILL);
                      setCustom(true);
                    }}
                    className="mt-5 flex w-full items-center justify-center md:justify-start gap-1.5 text-sm font-bold underline decoration-2 decoration-brand-500 underline-offset-4 hover:text-brand-500"
                  >
                    <LuPencilLine className="size-4" /> O descríbelo tú
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="custom"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: reduce ? 0 : 0.25 }}
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
                    autoFocus
                    // El cursor queda al final del texto prellenado, listo para seguir escribiendo.
                    onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter envía, Shift+Enter salta de línea; ESC regresa a los ejemplos.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit(text);
                      }
                      if (e.key === "Escape") setCustom(false);
                    }}
                    rows={5}
                    className="block w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pt-4 pb-1 text-base md:text-lg shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 placeholder:text-gray-400"
                  />
                  <div className="flex items-center justify-between gap-3 px-4 pb-3">
                    <button type="button" onClick={() => setCustom(false)} className="text-sm text-gray-500 hover:text-black">
                      ← Ver ejemplos
                    </button>
                    <button
                      type="submit"
                      disabled={text.trim() === CUSTOM_PREFILL.trim() || !text.trim()}
                      aria-label="Construir"
                      className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-500 px-4 py-2 font-bold text-black shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0"
                    >
                      Construir <LuArrowUp className="size-4" />
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
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
              className="flex w-full md:w-[38%] md:max-w-md flex-col gap-6 overflow-y-auto px-4 py-6 md:border-r-2 md:border-black"
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
              className="hidden md:flex flex-1 flex-col gap-3 bg-gray-50 p-4"
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
                  <TemplatePreview prompt={sent} template={sentTemplate} />
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
function TemplatePreview({ prompt, template }: { prompt: string; template: SiteTemplateKey | null }) {
  return (
    <div className="flex h-full flex-col">
      {/* Barra propia: la etiqueta nunca se encima con el nav del sitio. */}
      <div className="flex items-center gap-2 border-b-2 border-black bg-white px-3 py-1.5">
        <span className="size-2.5 rounded-full bg-brand-500" />
        <span className="text-xs font-bold">Ejemplo</span>
        <span className="text-xs text-gray-500">· tu sitio aparece aquí</span>
      </div>
      <iframe srcDoc={templateHtml(template ?? templateFor(prompt))} title="Ejemplo de sitio" sandbox="" className="min-h-0 w-full flex-1" />
    </div>
  );
}

/** Miniatura de una plantilla: su HTML de muestra escalado, sin interacción. */
function TemplateThumb({ k, className = "" }: { k: SiteTemplateKey; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border-2 border-black bg-white ${className}`}>
      <iframe
        srcDoc={templateHtml(k)}
        title=""
        aria-hidden="true"
        tabIndex={-1}
        sandbox=""
        className="pointer-events-none absolute left-0 top-0 h-[600px] w-[800px] origin-top-left"
        style={{ transform: "scale(var(--thumb-scale))" }}
      />
    </div>
  );
}

/** Select grande de plantillas: el botón muestra la elegida y la lista, la vista previa de cada una. */
function TemplateSelect({
  value,
  onChange,
  onBuild,
}: {
  value: SiteTemplateKey | null;
  onChange: (k: SiteTemplateKey) => void;
  onBuild: (k: SiteTemplateKey) => void;
}) {
  const [openList, setOpenList] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra con clic afuera y con ESC.
  useEffect(() => {
    if (!openList) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenList(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenList(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openList]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch gap-3">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openList}
          onClick={() => setOpenList((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-black bg-white p-2.5 text-left shadow-[4px_4px_0_0_#000] transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-[4px_4px_0_0_#9870ED]"
        >
          {value ? (
            <TemplateThumb k={value} className="h-12 w-16 shrink-0 [--thumb-scale:0.08]" />
          ) : (
            <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg border-2 border-dashed border-gray-400 text-gray-400">?</span>
          )}
          <span className="min-w-0 flex-1 truncate font-bold md:text-lg">{value ? templateLabel(value) : "Elige una plantilla"}</span>
          <LuChevronDown className={`size-5 shrink-0 transition-transform ${openList ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={() => value && onBuild(value)}
          className="flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-black bg-brand-500 px-4 font-bold text-black shadow-[4px_4px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0"
        >
          Construir <LuArrowUp className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {openList && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-30 mt-2 grid grid-cols-2 gap-3 rounded-2xl border-2 border-black bg-white p-3 shadow-[6px_6px_0_0_#000]"
          >
            {SITE_TEMPLATES.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === t.key}
                  onClick={() => {
                    onChange(t.key);
                    setOpenList(false);
                  }}
                  className={`w-full rounded-xl border-2 p-2 text-left transition-all hover:-translate-y-0.5 ${value === t.key ? "border-black bg-brand-500/15" : "border-transparent hover:border-black"}`}
                >
                  <TemplateThumb k={t.key} className="aspect-[4/3] w-full [--thumb-scale:0.29]" />
                  <span className="mt-1.5 block text-sm font-bold">{t.label}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
