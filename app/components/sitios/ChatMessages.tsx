import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Streamdown } from "streamdown";
import { LuCheck } from "react-icons/lu";
import { ImageGrid, TurnReceipt, TurnSummary, useImageLinks } from "@ghostystudio/computer/react";
import { partirNarracion } from "~/lib/narracion";
import { isPlumbing, stepVerb, upsertStep, type AgentStep } from "~/lib/agentSteps";

// Mensajes del chat del creador de sitios. Los usan el editor (/dash/sitios/:id) y el
// morph del hero de la home: un solo formato (pasos con palomita, markdown, tools
// contraídas), no una burbuja reinventada en cada superficie.

// `cortes`: largo del texto cuando arrancó cada herramienta — separa la narración
// («Reviso…», «Instalo…») de la respuesta final (ver ~/lib/narracion).
// `steps`: lo que pinta el panel «la computadora del agente» (navegador, terminal, editor).
export type Msg = { role: "user" | "bot"; text: string; tools?: string[]; cortes?: number[]; steps?: AgentStep[]; imageUrl?: string; quota?: boolean; approvals?: Approval[] };

/** Una herramienta que espera la aprobación de la persona (reglas «preguntar» del agente). */
export type Approval = { id: string; tool: string; summary: string; expiresAt: string; status?: "awaiting" | "approved" | "denied" | "error"; error?: string };

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

// El cierre, la cuadrícula de entregables y las ligas a imágenes viven en @ghostystudio/computer
// (el mismo chat de GTeams y /c). TurnSummary se reexporta para el replay.
export { TurnSummary };

export function BotMessage({
  msg,
  live,
  selectedStepId,
  onSelectStep,
  onApproval,
  onOpenReceipt,
}: {
  msg: Msg;
  live: boolean;
  /** Paso que muestra la computadora ahora: se resalta en la lista. */
  selectedStepId?: string | null;
  /** Picar un paso lleva la computadora a él. */
  onSelectStep?: (id: string) => void;
  /** Decide una aprobación de la tarjeta; sin esto la tarjeta no ofrece botones. */
  onApproval?: (a: Approval, decision: "approve" | "deny") => void;
  /** «▶ Ver cómo lo revisé»: abre la computadora repitiendo el turno. */
  onOpenReceipt?: () => void;
}) {
  const { pasos, resto } = partirNarracion(msg.text, msg.cortes);
  const secs = useElapsed(live);
  const steps = (msg.steps ?? []).filter((s) => !isPlumbing(s.tool));
  // Las ligas a imágenes del turno salen como pastilla «imagen N» y las entregadas van en
  // cuadrícula bajo la respuesta (patrón FileAttachmentGrid de Suna, en el paquete).
  const { delivered, components } = useImageLinks(resto ?? "", steps, onSelectStep);
  const receipt = !live && steps.length > 0 && !!onOpenReceipt;
  return (
    <div className="min-w-0 text-[15px] leading-6 text-gray-900">
      {/* Terminado, el comprobante (abajo) sustituye la lista de herramientas. */}
      {msg.tools && msg.tools.length > 0 && !receipt && (
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
      {(msg.approvals ?? []).map((a) => (
        <ApprovalCard key={a.id} a={a} onDecide={onApproval} />
      ))}
      {!live && delivered.length > 0 && <ImageGrid images={delivered} onSelect={onSelectStep} />}
      {receipt && (
        <div className="mt-3">
          <TurnReceipt steps={steps} onOpen={onOpenReceipt} />
        </div>
      )}
      {msg.quota && (
        <div className="mt-3 flex gap-2">
          <Link to="/dash/packs" className="px-3 py-1 rounded-lg bg-black text-white text-xs font-bold">Recargar</Link>
          <Link to="/planes" className="px-3 py-1 rounded-lg border-2 border-black text-xs font-bold">Subir de plan</Link>
        </div>
      )}
    </div>
  );
}

/**
 * «El agente quiere hacer esto y espera tu permiso»: la tool, con sus argumentos tal cual (el
 * resumen lo arma el servidor, no el modelo), y Aprobar / Negar. Aprobada, el agente la hace la
 * próxima vez que lo intente (le avisamos con un mensaje).
 */
function ApprovalCard({ a, onDecide }: { a: Approval; onDecide?: (a: Approval, d: "approve" | "deny") => void }) {
  const done = a.status === "approved" || a.status === "denied";
  return (
    <div className="mt-3 rounded-xl border-2 border-black bg-amber-50 p-3 shadow-[3px_3px_0_0_#000]">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-700">El agente espera tu permiso</p>
      <p className="mt-1 break-words font-mono text-[12px] leading-5 text-gray-800">{a.summary}</p>
      {done ? (
        <p className={`mt-2 text-sm font-bold ${a.status === "approved" ? "text-green-700" : "text-red-700"}`}>
          {a.status === "approved" ? "✓ Aprobado: se lo digo al agente para que lo haga." : "✗ Negado: el agente no lo hará."}
        </p>
      ) : onDecide ? (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => onDecide(a, "approve")} className="rounded-lg border-2 border-black bg-brand-500 px-3 py-1 text-sm font-bold text-white shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5">
            Aprobar
          </button>
          <button type="button" onClick={() => onDecide(a, "deny")} className="rounded-lg border-2 border-black bg-white px-3 py-1 text-sm font-bold hover:bg-gray-100">
            Negar
          </button>
        </div>
      ) : null}
      {a.status === "error" && <p className="mt-1 text-xs text-red-600">{a.error}</p>}
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
  else if (e.type === "approval" && e.approval?.id && !p.approvals?.some((a) => a.id === e.approval.id))
    msg = { ...p, approvals: [...(p.approvals ?? []), { ...e.approval, status: "awaiting" }] };
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
