import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowUp, LuBriefcase, LuCamera, LuRocket, LuX, LuExternalLink } from "react-icons/lu";
import { templateFor, templateHtml } from "./heroTemplates";
import { BotMessage, UserMessage, applyTurnEvent, type Msg } from "~/components/sitios/ChatMessages";

/**
 * Prompt del hero. Al enviar, la caja se transforma (layoutId, sin cambiar de ruta)
 * en el chat del creador de sitios: con sesión crea un sitio estático
 * (`POST /api/v2/sites`) y corre el primer turno aquí mismo, con la vista previa al
 * lado; sin sesión, el chat pide entrar y el prompt viaja a /dash/sitios/new.
 */

const CHIPS = [
  {
    Icon: LuBriefcase,
    label: "Despacho contable",
    prompt:
      "Sitio para un despacho contable: hero con el beneficio principal, servicios (contabilidad, nómina, declaraciones, facturación), a quién atendemos, equipo, testimonios y formulario de contacto. Sobrio y confiable.",
  },
  {
    Icon: LuCamera,
    label: "Portafolio",
    prompt:
      "Portafolio para un fotógrafo de bodas: hero con una foto a pantalla completa, galería por categorías, paquetes con precio, proceso en 4 pasos, testimonios y contacto. Estética editorial, tipografía serif.",
  },
  {
    Icon: LuRocket,
    label: "Lanzamiento",
    prompt:
      "Landing de lanzamiento para una app de finanzas personales: propuesta de valor con lista de espera, 3 beneficios, cómo funciona, preguntas frecuentes y CTA final. Moderna y directa.",
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
  const [previewKey, setPreviewKey] = useState(0);
  // La caja responde en su servidor de desarrollo: hasta entonces se ve la plantilla de muestra.
  const [previewReady, setPreviewReady] = useState(false);
  const reduce = useReducedMotion();
  const open = phase !== "idle";
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
      {/* Reserva el alto del prompt mientras está abierto el chat: el hero no salta. */}
      <div className="w-full max-w-xl min-h-[188px]">
        {!open && (
          <motion.form
            layoutId="eb-generator"
            transition={spring}
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className="w-full rounded-2xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000] focus-within:shadow-[6px_6px_0_0_#9870ED] transition-shadow text-left"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              Describe el sitio que quieres
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
              placeholder="Describe tu sitio: un consultorio dental con citas por WhatsApp…"
              className="block w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pt-4 pb-1 text-base md:text-lg shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 placeholder:text-gray-400"
            />
            <div className="flex items-center justify-end sm:justify-between gap-3 px-4 pb-3">
              <span className="hidden sm:inline text-xs text-gray-400 font-mono">Enter para enviar · Shift+Enter, otra línea</span>
              <button
                id="EmpezarGratisHome"
                type="submit"
                disabled={!text.trim()}
                aria-label="Construir"
                className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand-500 px-4 py-2 font-bold text-black shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0"
              >
                Construir <LuArrowUp className="size-4" />
              </button>
            </div>
          </motion.form>
        )}
        {!open && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
            {CHIPS.map(({ Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => setText(prompt)}
                className="flex items-center gap-1.5 rounded-full border-2 border-black bg-white px-3 py-1 text-sm hover:bg-brand-500/15 transition-colors"
              >
                <Icon className="size-4 text-brand-500" /> {label}
              </button>
            ))}
          </div>
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
              className="hidden md:flex flex-1 bg-gray-50 p-4"
            >
              <div className="relative flex-1 overflow-hidden rounded-xl border-2 border-black bg-white">
                {site?.previewUrl && (site.kind === "webapp" ? previewReady : tools > 0) ? (
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
