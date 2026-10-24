import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Streamdown } from "streamdown";
import { LuCheck, LuImage } from "react-icons/lu";
import { partirNarracion } from "~/lib/narracion";
import { formatWorked, isPlumbing, stepImages, stepVerb, turnSummary, upsertStep, type AgentStep } from "~/lib/agentSteps";

// Mensajes del chat del creador de sitios. Los usan el editor (/dash/sitios/:id) y el
// morph del hero de la home: un solo formato (pasos con palomita, markdown, tools
// contraídas), no una burbuja reinventada en cada superficie.

// `cortes`: largo del texto cuando arrancó cada herramienta — separa la narración
// («Reviso…», «Instalo…») de la respuesta final (ver ~/lib/narracion).
// `steps`: lo que pinta el panel «la computadora del agente» (navegador, terminal, editor).
export type Msg = { role: "user" | "bot"; text: string; tools?: string[]; cortes?: number[]; steps?: AgentStep[]; imageUrl?: string; quota?: boolean };

// Tools del turno agrupadas y contraídas: "3 búsquedas · 2 acciones" en vez de una
// lista cruda de nombres internos (tool_search_tool_bm25, mcp_easybits_run_tool…).
function summarizeTools(tools: string[]) {
  const counts = new Map<string, number>();
  for (const t of tools) {
    const label = /search|discover/.test(t) ? "búsqueda" : /read|list|get/.test(t) ? "lectura" : "acción";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n} ${n === 1 ? k : k === "acción" ? "acciones" : `${k}s`}`).join(" · ");
}


/** La respuesta del agente sin burbuja (como ghosty.studio): pasos con palomita, la
 *  respuesta en markdown con aire y las herramientas contraídas en una línea. */
// Qué está haciendo el agente, en palabras, según su última herramienta: hay modelos
// (Gemini) que encadenan lecturas sin narrar y el chat se quedaba en «construyendo…».
function liveStatus(tools: string[] | undefined, pasos: number) {
  const t = tools?.[tools.length - 1] ?? "";
  if (/write|edit|patch|deploy|theme/.test(t)) return "Haciendo cambios en tu app";
  if (/exec|bg|logs|restart|launch/.test(t)) return /launch/.test(t) ? "Publicando" : "Probando que todo funcione";
  if (/read|list|get|search|discover/.test(t)) return "Revisando tu app";
  return pasos ? "Trabajando" : "Pensando";
}

/** Segundos desde que el mensaje empezó a vivir (sólo cuenta mientras está en vivo). */
function useElapsed(live: boolean) {
  const [start] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  return Math.round((Date.now() - start) / 1000);
}

/**
 * Cierre del turno: «Trabajó 3 min · 9 pasos» y unas capturas como prueba. Picar una lleva la
 * computadora a ese paso (si hay `onSelectStep`).
 */
export function TurnSummary({ steps, onSelectStep, hideThumbs }: { steps: AgentStep[]; onSelectStep?: (id: string) => void; hideThumbs?: boolean }) {
  const r = turnSummary(steps);
  if (!r) return null;
  return (
    <div className="mt-3 rounded-xl border-2 border-black bg-white p-2.5 shadow-[3px_3px_0_0_#000]">
      <p className="text-xs font-bold">
        Trabajó {formatWorked(r.ms)} · {r.count} {r.count === 1 ? "paso" : "pasos"}
        {r.errors > 0 && <span className="font-normal text-gray-500"> · {r.errors} con error</span>}
      </p>
      {!hideThumbs && r.thumbs.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {r.thumbs.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!onSelectStep}
              onClick={() => onSelectStep?.(t.id)}
              className="overflow-hidden rounded-md border-2 border-black enabled:hover:-translate-y-0.5 enabled:transition"
              title={t.title}
            >
              <img src={t.image} alt={t.title || "Captura del navegador del agente"} loading="lazy" className="aspect-[4/3] w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Entregables del turno en cuadrícula (Suna `FileAttachmentGrid`): 1-3 columnas, alto fijo,
 * «+N» después de 5. Picar una la abre en la computadora, junto a su paso.
 */
function ImageGrid({ images, onSelect }: { images: { id: string; image: string; title?: string }[]; onSelect?: (id: string) => void }) {
  const shown = images.slice(0, 5);
  const rest = images.length - shown.length;
  const cols = shown.length === 1 ? "grid-cols-1" : shown.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`mt-3 grid gap-2 ${cols}`}>
      {shown.map((i, n) => (
        <button
          key={i.image}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(i.id)}
          className="relative h-36 overflow-hidden rounded-lg border-2 border-black bg-gray-100 shadow-[2px_2px_0_0_#000] enabled:transition enabled:hover:-translate-y-0.5"
          title={i.title}
        >
          <img src={i.image} alt={i.title ?? "Imagen del agente"} loading="lazy" className="h-full w-full object-cover object-top" />
          {n === shown.length - 1 && rest > 0 && <span className="absolute inset-0 grid place-items-center bg-black/55 text-lg font-bold text-white">+{rest}</span>}
        </button>
      ))}
    </div>
  );
}

export function BotMessage({
  msg,
  live,
  selectedStepId,
  onSelectStep,
}: {
  msg: Msg;
  live: boolean;
  /** Paso que muestra la computadora ahora: se resalta en la lista. */
  selectedStepId?: string | null;
  /** Picar un paso lleva la computadora a él. */
  onSelectStep?: (id: string) => void;
}) {
  const { pasos, resto } = partirNarracion(msg.text, msg.cortes);
  const secs = useElapsed(live);
  const steps = (msg.steps ?? []).filter((s) => !isPlumbing(s.tool));
  // Las ligas que el agente pega a imágenes de su propio turno (capturas, renders) se ven como
  // imagen y abren su paso en la computadora: antes salían como URLs crudas de storage.
  const images = new Map(stepImages(steps).map((i) => [i.image, i]));
  // Lo que el agente ENTREGÓ (las imágenes que menciona en su respuesta), en el orden en que las nombra.
  const delivered = images.size ? [...new Set([...(resto ?? "").matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((m) => m[0]))].map((u) => images.get(u)).filter((x) => !!x) : [];
  const components = images.size
    ? {
        a: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
          const img = href ? images.get(href) : undefined;
          if (!img)
            return (
              <a href={href} {...rest}>
                {children}
              </a>
            );
          // En el texto, una pastilla; la imagen va en la cuadrícula de abajo (patrón de Suna).
          return (
            <button
              type="button"
              onClick={() => onSelectStep?.(img.id)}
              className="inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 align-baseline text-[13px] font-semibold text-brand-500 hover:bg-brand-500/20"
            >
              <LuImage className="size-3.5" />
              {typeof children === "string" && /^https?:/.test(children) ? `imagen ${delivered.indexOf(img) + 1}` : children}
            </button>
          );
        },
      }
    : undefined;
  return (
    <div className="min-w-0 text-[15px] leading-6 text-gray-900">
      {msg.tools && msg.tools.length > 0 && (
        <details className="group mb-3 text-xs text-gray-400">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 hover:text-gray-600">
            ⚙ {summarizeTools(msg.tools)}
          </summary>
          {steps.length > 0 && onSelectStep ? (
            <ol className="mt-2 flex flex-col gap-0.5">
              {steps.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    data-step-id={s.id}
                    onClick={() => onSelectStep(s.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-brand-500/10 ${selectedStepId === s.id ? "bg-brand-500/15 font-bold text-gray-800" : ""}`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${s.status === "error" ? "bg-red-500" : s.status === "running" ? "animate-pulse bg-brand-500" : "bg-green-500"}`} />
                    <span className="min-w-0 truncate">
                      {s.intent ?? stepVerb(s)}
                      {s.detail && <span className="font-mono text-[11px] text-gray-400"> · {s.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 font-mono text-[11px] leading-5 break-all">{msg.tools.join(" · ")}</p>
          )}
        </details>
      )}
      {pasos.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {pasos.map((p, i) => (
            <li key={i} className="eb-paso flex items-start gap-2.5 text-[14px] leading-[21px] text-gray-500">
              <span className="mt-[2px] grid size-[18px] shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-500">
                <LuCheck className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="min-w-0 break-words">{p.split(/`([^`]+)`/).map((t, j) => (j % 2 ? <code key={j}>{t}</code> : t))}</span>
            </li>
          ))}
        </ul>
      )}
      {resto ? (
        <div className="eb-md min-w-0 break-words">
          <Streamdown linkSafety={{ enabled: false }} components={components}>
            {resto}
          </Streamdown>
        </div>
      ) : (
        live && (
          <span className="inline-flex items-center gap-2 text-sm text-gray-400">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500/60" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            {liveStatus(msg.tools, pasos.length)}…{secs >= 5 ? ` ${secs} s` : ""}
          </span>
        )
      )}
      {!live && delivered.length > 0 && <ImageGrid images={delivered} onSelect={onSelectStep} />}
      {!live && steps.length > 0 && onSelectStep && <TurnSummary steps={steps} onSelectStep={onSelectStep} hideThumbs={delivered.length > 0} />}
      {msg.quota && (
        <div className="mt-3 flex gap-2">
          <Link to="/dash/packs" className="px-3 py-1 rounded-lg bg-black text-white text-xs font-bold">Recargar</Link>
          <Link to="/planes" className="px-3 py-1 rounded-lg border-2 border-black text-xs font-bold">Subir de plan</Link>
        </div>
      )}
    </div>
  );
}

export function UserMessage({ msg }: { msg: Msg }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] rounded-2xl bg-brand-500 px-4 py-3 text-[15px] leading-[22px] text-white whitespace-pre-wrap break-words">
        {msg.imageUrl && <img src={msg.imageUrl} alt="" className="max-h-40 rounded-lg mb-2 border border-white/30" />}
        {msg.text}
      </div>
    </div>
  );
}

/** Aplica un evento SSE del turno (`/api/v2/sites/:id/chat`) al último mensaje del bot.
 *  `final` = el turno terminó; `cut` = turnId interrumpido por un reinicio (ofrecer «Continuar»). */
export function applyTurnEvent(p: Msg, e: { type: string; [k: string]: any }): { msg: Msg; final: boolean; cut?: string | null } {
  let msg = p;
  let cut: string | null | undefined;
  if (e.type === "chunk") msg = { ...p, text: p.text + e.value };
  else if (e.type === "snapshot") msg = { ...p, text: e.text ?? "", tools: e.tools ?? [], cortes: e.cortes ?? [], steps: e.steps ?? p.steps };
  else if (e.type === "step" && e.step?.id) msg = { ...p, steps: upsertStep(p.steps ?? [], e.step) };
  else if (e.type === "tool" && e.phase === "start")
    msg = {
      ...p,
      tools: [...(p.tools ?? []), e.name],
      cortes: p.text.trim() && p.cortes?.[p.cortes.length - 1] !== p.text.length ? [...(p.cortes ?? []), p.text.length] : p.cortes,
    };
  // done vacío = el turno se cortó sin respuesta (límite del motor): decirlo, no dejar «construyendo…».
  // Se queda lo que llegó por el stream: los `cortes` se midieron sobre ese texto.
  else if (e.type === "done") msg = { ...p, text: p.text || e.value || "⚠️ El agente no terminó a tiempo y no respondió. Vuelve a intentarlo." };
  else if (e.type === "error") msg = { ...p, text: [p.text, `⚠️ ${e.message}`].filter(Boolean).join("\n\n") };
  else if (e.type === "capacity") msg = { ...p, text: `⏳ ${e.message} — reintenta en unos segundos.` };
  else if (e.type === "interrupted") {
    msg = { ...p, text: [p.text, "_Se interrumpió por un reinicio de la plataforma._"].filter(Boolean).join("\n\n") };
    cut = e.turnId ?? null;
  }
  return { msg, final: ["done", "error", "capacity", "interrupted", "idle"].includes(e.type), cut };
}
