import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Streamdown } from "streamdown";
import { LuCheck } from "react-icons/lu";
import { partirNarracion } from "~/lib/narracion";
import { upsertStep, type AgentStep } from "~/lib/agentSteps";

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

export function BotMessage({ msg, live }: { msg: Msg; live: boolean }) {
  const { pasos, resto } = partirNarracion(msg.text, msg.cortes);
  const secs = useElapsed(live);
  return (
    <div className="min-w-0 text-[15px] leading-6 text-gray-900">
      {msg.tools && msg.tools.length > 0 && (
        <details className="group mb-3 text-xs text-gray-400">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 hover:text-gray-600">
            ⚙ {summarizeTools(msg.tools)}
          </summary>
          <p className="mt-2 font-mono text-[11px] leading-5 break-all">{msg.tools.join(" · ")}</p>
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
          <Streamdown linkSafety={{ enabled: false }}>{resto}</Streamdown>
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
