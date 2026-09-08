/**
 * /dash/flota — nueva interfaz de la flota, sobre datos REALES.
 *
 * Reusa el loader y el action de `fleet-agents.tsx` (misma fuente de verdad, mismos
 * intents) y sólo cambia la FORMA. Convive con la vista clásica mientras se decide;
 * nada aquí duplica lógica de servidor.
 *
 * Lo que cambia respecto a /dash/flota:
 *  · El objeto principal es el ROSTER de agentes, no un acordeón. El avatar lleva
 *    el estado (patrón Grok Bot: el estado vive en la identidad, no en un badge más).
 *  · La configuración NUNCA se esconde cuando el canal se cae — ese fue el bug que
 *    hizo desaparecer los 8 grupos de Pia-0 con el socket muerto.
 *  · Los canales son VARIOS (WhatsApp, WhatsApp Business, Teams, Web) y se ven a la
 *    vez, con su propio conteo: cuál recibe y cuál está apagado se lee de un vistazo.
 *  · Las cajas (microVMs) se dibujan como píxeles: ocupada, dormida, libre. La
 *    capacidad deja de ser un número escondido.
 *  · El ENSAYO vive al lado de la config, no en otra pantalla (patrón ElevenLabs):
 *    se prueba y se corrige sin quemar el grupo real.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { FLEET_ENGINES, engineCreatable } from "~/lib/fleetEngines";
import { zipStore } from "~/lib/zip";

// Editor de prompts del proyecto (CodeMirror + preview markdown, client-only).
// Un prompt es markdown, no texto con formato: Tiptap serializaría HTML dentro del
// system prompt. Si lo quieres WYSIWYG de todos modos, es cambiar esta línea.
const PromptEditor = lazy(() => import("./PromptEditor.client").then((m) => ({ default: m.PromptEditor })));

export { loader, action } from "./fleet-agents";

// ── Canales: FUENTE ÚNICA ───────────────────────────────────────────────────
// El header, las pestañas y el estado del agente derivan TODOS de aquí. Antes cada
// sitio calculaba su propia noción de "conectado" y se contradecían: la cabecera
// decía "sin canales" mientras la pestaña mostraba un grupo activo. Tres estados,
// no dos — un canal CONFIGURADO pero caído no es lo mismo que uno que nunca existió:
//  · live       = recibe de verdad ahora.
//  · configured = tiene destinos guardados pero no recibe (sesión caída, apagado).
//  · off        = no está configurado.
type ChState = "live" | "configured" | "off";
type Channel = { kind: string; label: string; state: ChState; count: number };

const CH_DOT: Record<ChState, string> = {
  live: "bg-emerald", configured: "bg-munsell", off: "bg-gray-300",
};
const CH_HINT: Record<ChState, string> = {
  live: "recibiendo", configured: "configurado, sin recibir", off: "sin conectar",
};

function channelsOf(p: any): Channel[] {
  const waLive = p.status === "connected" && p.live;
  const waCount = (p.groups ?? []).filter((g: any) => g.enabled).length;
  const wabaLive = (p.wabaNumbers ?? []).some((w: any) => w.mode !== "off");
  const wabaCount = p.wabaNumbers?.length ?? 0;
  return [
    { kind: "baileys", label: "WhatsApp", count: waCount,
      state: waLive ? "live" : waCount > 0 ? "configured" : "off" },
    { kind: "waba", label: "WhatsApp Business", count: wabaCount,
      state: wabaLive ? "live" : wabaCount > 0 ? "configured" : "off" },
    { kind: "teams", label: "Ghosty Teams", count: p.teamsChannel?.connected ? 1 : 0,
      state: p.teamsChannel?.connected ? "live" : p.teamsChannel?.systemPrompt || p.teamsChannel?.mcps?.length ? "configured" : "off" },
    { kind: "web", label: "Web", count: p.webChannel?.connected ? 1 : 0,
      state: p.webChannel?.connected ? "live" : p.webChannel?.systemPrompt || p.webChannel?.keySet || p.webChannel?.mcps?.length ? "configured" : "off" },
  ];
}

// ── Estado del agente ───────────────────────────────────────────────────────
type State = "working" | "idle" | "waiting" | "down" | "off";

const LABEL: Record<State, string> = {
  working: "trabajando", idle: "en reposo", waiting: "dormido",
  down: "sin conexión", off: "sin canales",
};
const DOT: Record<State, string> = {
  working: "bg-brand-500", idle: "bg-emerald", waiting: "bg-munsell",
  down: "bg-brand-pink", off: "bg-gray-300",
};
const MOTION: Record<State, any> = {
  working: { animate: { rotate: [0, -7, 7, 0], y: [0, -2, 0] }, transition: { duration: 1.1, repeat: Infinity } },
  idle: { animate: { scale: [1, 1.03, 1] }, transition: { duration: 3.2, repeat: Infinity } },
  waiting: { animate: { y: [0, -3, 0] }, transition: { duration: 2.4, repeat: Infinity } },
  down: { animate: { rotate: [0, -2, 2, 0] }, transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2.5 } },
  off: { animate: { opacity: 0.45 }, transition: { duration: 0.3 } },
};

function agentState(p: any): State {
  const ch = channelsOf(p);
  if (!ch.some((c) => c.state !== "off")) return "off";
  // Configurado pero ningún canal vivo: es una CAÍDA, no "sin canales" — la
  // diferencia es justo lo que hay que arreglar, y decir "sin canales" la escondía.
  if (!ch.some((c) => c.state === "live")) return "down";
  if ((p.machines ?? []).some((m: any) => m.status === "running")) return "working";
  if ((p.machines ?? []).some((m: any) => m.status === "suspended")) return "waiting";
  return "idle";
}

function Avatar({ color, state, size = 44 }: { color: string; state: State; size?: number }) {
  const eye = size * 0.13;
  return (
    <motion.div
      {...MOTION[state]}
      className="relative shrink-0 rounded-2xl border-2 border-black flex items-center justify-center gap-[14%]"
      style={{ width: size, height: size, background: color || "#9870ED" }}
    >
      {[0, 1].map((i) => (
        <motion.span key={i} className="block rounded-full bg-black"
          style={{ width: eye, height: eye * (state === "off" ? 0.25 : 1.35) }}
          animate={state === "off" ? {} : { scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1], delay: i * 0.04 }} />
      ))}
    </motion.div>
  );
}

// Skeleton: sólo donde de verdad se espera algo (el editor pesado que carga en
// cliente y el historial del ensayo). Las pestañas ya no esperan a nadie.
function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-gray-200" style={{ width: `${92 - (i % 4) * 14}%` }} />
      ))}
    </div>
  );
}

function CopyButton({ value, label = "Copiar", className = "" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }).catch(() => {});
      }}
      className={`border-2 border-black rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${done ? "bg-emerald" : "bg-white hover:bg-grayLight"} ${className}`}>
      {done ? "Copiado ✓" : label}
    </button>
  );
}

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" disabled={busy} onClick={onClick}
      className={`w-10 h-6 rounded-full border-2 border-black shrink-0 flex items-center px-0.5 transition-colors disabled:opacity-50 ${on ? "bg-brand-500" : "bg-white"}`}>
      <motion.span layout className="block w-4 h-4 rounded-full bg-white border-2 border-black"
        style={{ marginLeft: on ? "auto" : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }} />
    </button>
  );
}

function Card({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-2 border-black rounded-2xl bg-white overflow-hidden ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b-2 border-black bg-grayLight">
        <h3 className="text-sm font-bold">{title}</h3>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

// Saltos de scroll: un prompt de 78 KB hace páginas larguísimas y llegar al final
// (o volver) a rueditas es una tortura. Aparecen sólo si hay algo que scrollear.
function ScrollJumps() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => setShow(document.documentElement.scrollHeight > window.innerHeight + 240);
    check();
    window.addEventListener("resize", check);
    const t = setInterval(check, 1000);
    return () => { window.removeEventListener("resize", check); clearInterval(t); };
  }, []);
  if (!show) return null;
  const go = (top: number) => window.scrollTo({ top, behavior: "smooth" });
  return (
    <div className="fixed right-4 bottom-4 z-30 flex flex-col gap-1.5">
      {[
        { label: "Ir arriba", d: "M12 19V5M5 12l7-7 7 7", to: 0 },
        { label: "Ir abajo", d: "M12 5v14M19 12l-7 7-7-7", to: 1e9 },
      ].map((b) => (
        <button key={b.label} type="button" title={b.label} aria-label={b.label} onClick={() => go(b.to)}
          className="w-9 h-9 grid place-items-center rounded-xl border-2 border-black bg-white hover:bg-brand-100 transition-colors shadow-[2px_2px_0_0_#000]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={b.d} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function Expand({ onClick, label = "Expandir" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="p-1.5 rounded-lg border-2 border-gray-200 text-marengo hover:border-black hover:text-onix transition-colors">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
    </button>
  );
}

// Modal a pantalla casi completa — cierra con ESC. Sin scroll de página detrás.
function FullScreen({ title, onClose, children, size = "full" }: { title: string; onClose: () => void; children: React.ReactNode; size?: "full" | "auto" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 bg-black/40 p-4 sm:p-8 flex"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={`m-auto w-full bg-white border-2 border-black rounded-2xl flex flex-col overflow-hidden ${size === "auto" ? "max-w-xl max-h-full" : "max-w-5xl h-full"}`}
        initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 8 }}
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-2.5 border-b-2 border-black bg-grayLight shrink-0">
          <h3 className="text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-xs font-bold text-marengo hover:text-onix">Cerrar (ESC)</button>
        </header>
        <div className={`flex flex-col p-4 ${size === "auto" ? "overflow-y-auto eb-thin" : "flex-1 min-h-0"}`}>{children}</div>
      </motion.div>
    </motion.div>
  );
}

const SKILL_TEMPLATE = `---
name: cotizacion
description: Genera la cotización oficial en PDF con datos bancarios y link de pago. Úsalo cuando pidan precio, cotización o factura de productos.
metadata:
  author: tu-empresa
  version: "1.0"
---

# Cotización

Explica aquí, en imperativo, QUÉ hace el skill y CUÁNDO usarlo. El agente sólo lee
este archivo cuando la descripción de arriba encaja con lo que le están pidiendo,
así que la descripción es lo más importante del archivo.

## Cómo se hace

1. Consulta el catálogo antes de dar cualquier precio — nunca de memoria.
2. Arma el PDF con la plantilla de la empresa.
3. Devuelve el link de pago junto con el PDF.

## Reglas

- Si falta un dato del cliente (RFC, razón social), pídelo antes de emitir.
- Nunca inventes precios ni descuentos que no estén en el catálogo.

## Archivos que acompañan a este skill

Al agente le llegan por NOMBRE, con su ruta relativa y una URL de descarga — no hay
carpetas de verdad en su máquina. Refiérete a ellos exactamente como se llaman:
por ejemplo "scripts/cotizar.mjs". Dile que lo descargue y lo ejecute, en vez de
calcular a mano.
`;

// Script de ejemplo que acompaña al SKILL.md — la plantilla decía "sube tus
// scripts" y entregaba un solo archivo: ahora el ZIP trae uno de verdad, con la
// forma que espera el worker (Node, sin dependencias, imprime a stdout).
const SKILL_SCRIPT = `#!/usr/bin/env node
// scripts/cotizar.mjs — ejemplo. El agente lo ejecuta con:
//   node scripts/cotizar.mjs '{"cliente":"ACME","items":[{"sku":"A-1","cantidad":12}]}'
// Todo lo que imprimas en stdout es lo que el agente lee.

const entrada = JSON.parse(process.argv[2] ?? "{}");

// 1. NUNCA precios de memoria: aquí consultas tu catálogo real.
const CATALOGO = { "A-1": { nombre: "Cortina blackout 2m", precio: 1240 } };

const lineas = (entrada.items ?? []).map((it) => {
  const p = CATALOGO[it.sku];
  if (!p) throw new Error(\`SKU desconocido: \${it.sku}\`);
  return { ...it, nombre: p.nombre, unitario: p.precio, total: p.precio * it.cantidad };
});

const subtotal = lineas.reduce((s, l) => s + l.total, 0);
// 2. Escalones de descuento: en el código, no a criterio del modelo.
const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
const descuento = piezas >= 25 ? 0.12 : piezas >= 10 ? 0.08 : 0;

console.log(JSON.stringify({
  cliente: entrada.cliente ?? null,
  lineas,
  subtotal,
  descuento,
  total: Math.round(subtotal * (1 - descuento) * 100) / 100,
}, null, 2));
`;

// ── Cajas: una carita por microVM ──────────────────────────────────────────
// Una caja = una microVM, y una microVM es SIEMPRE de un agente: por eso lleva su
// color y sus ojitos. Despierta = ojos abiertos; dormida = ojos cerrados (es un
// snapshot, revive en ~1s); libre = hueco punteado. Un cuadro morado anónimo no
// decía de quién era la caja, que es justo lo que quieres saber cuando se llenan.
// ⚠️ Una caja NO es una conversación: sostiene hasta `maxWorkersPerVm` (hoy 4).
// Dibujarlas 1:1 mentía sobre la capacidad — por eso cada carita lleva debajo sus
// ranuras: llenas = conversaciones pegadas a esa VM, vacías = sitio libre DENTRO
// de una caja que ya está encendida (no cuesta caja nueva).
function BoxFace({ color, state, title, slots, perVm }: { color: string; state: "running" | "building" | "suspended" | "system"; title: string; slots?: number; perVm?: number }) {
  const asleep = state === "suspended";
  return (
    <span className="flex flex-col items-center gap-1">
    <motion.span title={title}
      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
      className={`relative w-6 h-6 rounded-[7px] border-2 border-black flex items-center justify-center gap-[3px] ${asleep ? "opacity-50" : ""}`}
      style={{ background: color }}>
      {[0, 1].map((i) => (
        <motion.span key={i} className="block rounded-full bg-black"
          style={{ width: 3, height: asleep ? 1.5 : 4 }}
          animate={asleep ? {} : { scaleY: [1, 1, 0.15, 1] }}
          transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.93, 0.965, 1], delay: i * 0.05 }} />
      ))}
      {state === "building" && (
        <motion.span className="absolute -inset-1 rounded-[9px] border-2 border-brand-yellow"
          animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity }} />
      )}
    </motion.span>
    {perVm ? (
      <span className="flex gap-[2px]" title={`${slots ?? 0} de ${perVm} conversaciones en esta caja`}>
        {Array.from({ length: perVm }).map((_, i) => (
          <i key={i} className={`w-[3px] h-[3px] rounded-full not-italic ${i < (slots ?? 0) ? "bg-onix" : "bg-gray-300"}`} />
        ))}
      </span>
    ) : null}
    </span>
  );
}

function Boxes({ pools, capacity }: { pools: any[]; capacity: any }) {
  const workers = pools.flatMap((p: any) =>
    (p.machines ?? []).map((m: any) => ({
      key: m.id, color: p.mascotColor || "#9870ED", status: m.status as any,
      slots: m.slots ?? 0, perVm: p.maxWorkersPerVm ?? capacity.maxWorkersPerVm ?? 4,
      title: `${p.name ?? "agente"} · ${m.status === "suspended" ? "dormida" : m.status === "building" ? "encendiendo" : "despierta"} · ${m.slots ?? 0}/${p.maxWorkersPerVm ?? capacity.maxWorkersPerVm ?? 4} conversaciones`,
    }))
  );
  const extras = (capacity.extraMachines ?? []).map((m: any) => ({
    key: m.id, color: "#D6D3D1", status: m.status as any, title: `${m.label ?? "servicio"} · ${m.status}`,
  }));
  const parked = (capacity.parkedExtras ?? []).map((m: any) => ({
    key: m.id, color: "#D6D3D1", status: "suspended" as const, title: `${m.label ?? "servicio"} · dormida en disco`,
  }));
  const free = Math.max(0, (capacity.maxMachines ?? 0) - workers.length - extras.length);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {[...workers, ...extras, ...parked].map((b: any) => (
            <BoxFace key={b.key} color={b.color} state={b.status} title={b.title} slots={b.slots} perVm={b.perVm} />
          ))}
          {Array.from({ length: free }).map((_, k) => (
            <motion.span key={`free-${k}`} title="cupo libre"
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              className="w-6 h-6 rounded-[7px] border-2 border-dashed border-gray-300 self-start" />
          ))}
        </AnimatePresence>
      </div>
      <p className="text-[11px] text-marengo">
        Cada carita es una caja y cada caja sostiene {capacity.maxWorkersPerVm ?? 4} conversaciones
        (los puntitos de abajo). Ojos abiertos = atiende · cerrados = duerme, revive en 1s ·
        punteada = cupo libre · {capacity.agentsActive}/{capacity.agentsMax} en total
      </p>
    </div>
  );
}

// ── Inbox de WhatsApp Business ─────────────────────────────────────────────
// Donde el dueño toma una conversación: la pausa para atenderla él, marca a alguien
// como admin, o la deja hablar cuando el número responde "sólo a permitidos".
// La lista NO viene del loader (son mensajes, otra tabla): endpoint propio con
// búsqueda server-side por teléfono o nombre.
type WabaConv = {
  sender: string; name: string; lastText: string; lastRole: string; lastAt: string;
  count: number; allowed: boolean; admin: boolean;
  paused: boolean; permanent: boolean; until: string | null;
};

function PauseLeft({ until }: { until: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const ms = Date.parse(until) - Date.now();
  if (ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  return <span className="text-[11px] text-marengo">· {min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`}</span>;
}

function WabaInbox({ agent, number }: { agent: { id: string }; number: { integrationId: string; subject: string; mode: string } }) {
  const [q, setQ] = useState("");
  const [convs, setConvs] = useState<WabaConv[] | null>(null);
  const act = useFetcher();

  const reload = () => {
    const url = `/api/v2/fleet-agents/${agent.id}/waba-inbox?integrationId=${encodeURIComponent(number.integrationId)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
    // Este endpoint autentica por SESIÓN (getUserOrRedirect), no por token del
    // agente: la cookie viaja sola al ser mismo origen.
    fetch(url)
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConvs(d.conversations ?? []))
      .catch(() => setConvs([]));
  };
  // Debounce 250ms: cada tecla es una consulta a mensajes.
  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, agent.id, number.integrationId]);
  // Tras cada acción, refrescar (pausar/reanudar pasa por Formmy y puede fallar).
  useEffect(() => { if (act.state === "idle" && act.data) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [act.state, act.data]);

  const send = (fields: Record<string, string>, c: WabaConv) =>
    act.submit({ ...fields, fleetAgentId: agent.id, integrationId: number.integrationId, sender: c.sender },
      { method: "post", action: "/dash/flota" });
  const busy = act.state !== "idle";

  return (
    <div className="flex flex-col gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por teléfono o nombre…"
        className="w-full border-2 border-black rounded-xl px-3 py-2 text-sm focus:outline-none" />
      {convs === null && <Skeleton lines={5} />}
      {convs?.length === 0 && <p className="text-xs text-tale">Sin conversaciones{q.trim() ? " que coincidan" : " todavía"}.</p>}
      <ul className="flex flex-col gap-2">
        {(convs ?? []).map((c) => (
          <li key={c.sender} className="flex flex-col gap-2 border-2 border-gray-200 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <button type="button" title={c.admin ? "Quitar admin" : "Marcar como admin (puede administrar al agente)"}
                onClick={() => send({ intent: "waba-set-admin", on: c.admin ? "0" : "1" }, c)}
                className={`shrink-0 text-xs font-bold px-2 py-1 rounded-lg border-2 ${c.admin ? "border-black bg-brand-500 text-white" : "border-gray-200 text-tale hover:border-black hover:text-onix"}`}>
                {c.admin ? "★" : "☆"}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {c.name || c.sender}
                  <span className="ml-2 text-[11px] font-normal text-tale font-mono">{c.sender}</span>
                </p>
                <p className="text-[11px] text-tale truncate">
                  {c.paused
                    ? "El agente no responde aquí — la atiendes tú"
                    : `${c.lastRole === "agent" ? "↩︎ " : ""}${c.lastText}`}
                </p>
              </div>
              {c.paused && (
                <span className="shrink-0 text-[11px] font-semibold text-brand-red">
                  ⏸ {c.permanent ? "pausada" : "en pausa"}<PauseLeft until={c.until} />
                </span>
              )}
              <span className="shrink-0 text-[11px] text-marengo">{c.count}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.paused ? (
                <button type="button" disabled={busy} onClick={() => send({ intent: "waba-resume" }, c)}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg border-2 border-black bg-brand-500 text-white disabled:opacity-50">
                  Devolvérsela al agente
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-tale">Atenderla yo:</span>
                  {([["30min", "30 min"], ["2h", "2 horas"], ["permanent", "hasta que yo diga"]] as const).map(([d, label]) => (
                    <button key={d} type="button" disabled={busy} onClick={() => send({ intent: "waba-pause", duration: d }, c)}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg border-2 border-gray-200 hover:border-black disabled:opacity-50">
                      {label}
                    </button>
                  ))}
                </>
              )}
              {number.mode === "only" && (
                <button type="button" disabled={busy} onClick={() => send({ intent: "toggle-waba-sender", on: c.allowed ? "0" : "1" }, c)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg border-2 ${c.allowed ? "border-black bg-emerald" : "border-gray-200 text-tale hover:border-black"}`}>
                  {c.allowed ? "En la lista" : "Dejarle hablar"}
                </button>
              )}
              <button type="button" disabled={busy} title="Pídele al agente que escriba ahora"
                onClick={() => send({ intent: "waba-request-reply" }, c)}
                className="text-[11px] font-bold px-2 py-1 rounded-lg border-2 border-gray-200 hover:border-black disabled:opacity-50">
                Que responda
              </button>
              <button type="button" disabled={busy} title="Empieza de cero: olvida el hilo de esta conversación"
                onClick={() => send({ intent: "waba-clear" }, c)}
                className="ml-auto text-[11px] font-bold text-tale hover:text-brand-red underline underline-offset-2 disabled:opacity-50">
                Olvidar el hilo
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ensayo ─────────────────────────────────────────────────────────────────
// El `configGroupId` es OBLIGATORIO: sin él el turno arranca sin los conectores del
// canal y parece que el MCP está roto (ver CLAUDE.md, sección FleetAgent).
function useEnsayo(agent: { id: string; token: string }, cfgId: string, admin: boolean) {
  const [msgs, setMsgs] = useState<Array<{ role: "user" | "bot"; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const groupId = `web-test-${agent.id}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/fleet-agents/${agent.id}/message-stream?groupId=${encodeURIComponent(groupId)}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: any) => {
        if (alive && Array.isArray(d.messages)) {
          setMsgs(d.messages.map((m: any) => ({ role: m.role === "user" ? "user" : "bot", text: m.text })));
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [agent.id, agent.token, groupId]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }, { role: "bot", text: "" }]);
    const setLast = (fn: (prev: string) => string) =>
      setMsgs((m) => { const n = [...m]; n[n.length - 1] = { role: "bot", text: fn(n[n.length - 1].text) }; return n; });
    try {
      const res = await fetch(`/api/v2/fleet-agents/${agent.id}/message-stream`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, configGroupId: cfgId, sender: "web-test", text, admin }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        setLast(() => `⚠️ Error ${res.status}${t ? ` — ${t.slice(0, 140)}` : ""}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const dl = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data: "));
          buf = buf.slice(nl + 2);
          if (!dl) continue;
          try {
            const e = JSON.parse(dl.slice(6));
            if (e.type === "chunk" && typeof e.value === "string") setLast((p) => p + e.value);
            else if (e.type === "done" && typeof e.value === "string") setLast(() => e.value);
            else if (e.type === "error") setLast(() => `⚠️ ${e.message || "error"}`);
          } catch { /* evento malformado */ }
        }
      }
    } catch (err) {
      setLast(() => `⚠️ ${err instanceof Error ? err.message : "error de red"}`);
    } finally {
      setBusy(false);
    }
  }
  return { msgs, busy, loading, send };
}

function EnsayoBody({ msgs, busy, loading, onSend, tall }: { msgs: any[]; busy: boolean; loading?: boolean; onSend: (t: string) => void; tall?: boolean }) {
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const go = () => { const t = input.trim(); if (!t) return; setInput(""); onSend(t); };
  return (
    <>
      <div ref={bodyRef} className={`eb-thin flex flex-col gap-2 overflow-y-auto pr-1 ${tall ? "flex-1 min-h-0" : "h-[calc(100vh-21rem)] min-h-[320px]"}`}>
        {loading && msgs.length === 0 && <div className="p-2"><Skeleton lines={4} /></div>}
        {!loading && msgs.length === 0 && (
          <p className="text-xs text-tale m-auto text-center px-6 leading-relaxed">
            Pídele algo como lo haría un cliente. Es una conversación aparte:
            <b> no toca tus grupos</b>.
          </p>
        )}
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`max-w-[85%] text-sm rounded-2xl px-3 py-2 border-2 border-black whitespace-pre-wrap break-words ${m.role === "user" ? "self-end bg-brand-100" : "self-start bg-white"}`}>
            {m.text || (busy && i === msgs.length - 1 ? "…" : "")}
          </motion.div>
        ))}
      </div>
      <div className="flex gap-2 mt-3 shrink-0">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Pídele algo, o dile cómo cambiar"
          className="flex-1 border-2 border-black rounded-xl px-3 py-2 text-sm focus:outline-none" />
        <button onClick={go} disabled={busy}
          className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-500 text-white disabled:opacity-50">
          {busy ? "…" : "Enviar"}
        </button>
      </div>
    </>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function Flota2() {
  const { pools, capacity, engineHasSecret } = useLoaderData() as any;
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  // Agente y pestaña viven en la URL (?a=…&t=…), no en useState: así sobreviven al
  // refresh (que un `fetcher` dispara solo al guardar) y el enlace es compartible.
  // UNA sola navegación: instrucciones, capacidades y un tab POR CANAL. Antes había
  // chips en la cabecera + pestaña "Canales" + pills dentro: tres niveles para la
  // misma cosa, y el usuario no sabía cuál mandaba.
  // ⚠️ NO usar setSearchParams: es una navegación y REVALIDA el loader — y este
  // loader habla con WhatsApp (groupFetch) y con Mongo, así que cambiar de pestaña
  // costaba cientos de ms. El estado manda para pintar (instantáneo) y la URL se
  // sincroniza con history.replaceState, que no dispara loaders pero sobrevive al
  // refresh y deja el enlace compartible.
  const [params] = useSearchParams();
  const [selId, setSelIdState] = useState<string | null>(() => params.get("a") ?? pools[0]?.id ?? null);
  const [tab, setTabState] = useState<string>(() => params.get("t") ?? "instrucciones");
  // El servidor no sabe qué había en localStorage, así que la primera pintada usa
  // la URL (o el default) y en cuanto montamos recuperamos lo último elegido. Sin
  // esto la hidratación no coincidiría con el HTML del servidor.
  useEffect(() => {
    if (params.get("t") || params.get("a")) return;
    try {
      const a = localStorage.getItem("flota:a");
      const t = localStorage.getItem("flota:t");
      if (a && pools.some((p: any) => p.id === a)) setSelIdState(a);
      if (t) setTabState(t);
    } catch { /* modo privado */ }
    // sólo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remember = (k: string, v: string) => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(`flota:${k}`, v); } catch { /* modo privado */ }
    const u = new URL(window.location.href);
    u.searchParams.set(k, v);
    window.history.replaceState(window.history.state, "", u);
  };
  const setSelId = (id: string) => { setSelIdState(id); remember("a", id); };
  const setTab = (t: string) => { setTabState(t); remember("t", t); };
  const [showAll, setShowAll] = useState(false);
  const [groupQ, setGroupQ] = useState("");
  const [dirty, setDirty] = useState(false);
  const [big, setBig] = useState<null | "prompt" | "ensayo">(null);
  const [creds, setCreds] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const skillInput = useRef<HTMLInputElement>(null);
  const [killSkill, setKillSkill] = useState<string | null>(null);
  const [killAgent, setKillAgent] = useState(false);
  const [inbox, setInbox] = useState<any | null>(null);
  const [chanCfg, setChanCfg] = useState<string | null>(null);
  const [killName, setKillName] = useState("");
  const [addMcp, setAddMcp] = useState(false);
  const [capInfo, setCapInfo] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [engineId, setEngineId] = useState(FLEET_ENGINES.find(engineCreatable)?.id ?? "claude");
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  // Dos MÉTODOS de vinculación, no dos botones sueltos: "Conectar con QR" junto a un
  // campo de teléfono se leía como si el número fuera parte del QR.
  const [pairMode, setPairMode] = useState<"qr" | "code">("qr");
  const [wabaBusy, setWabaBusy] = useState(false);
  const [wabaError, setWabaError] = useState<string | null>(null);
  // El ensayo va SIEMPRE en modo admin: es el panel del dueño (el servidor sólo
  // concede admin con su sesión) y el objetivo del ensayo es justamente decirle al
  // agente cómo cambiar. Un interruptor aquí era una pregunta que nadie quiere
  // contestar dos veces al día.
  const adminMode = true;

  const sel = useMemo(() => pools.find((p: any) => p.id === selId) ?? pools[0], [pools, selId]);
  const groups: any[] = sel?.groups ?? [];
  const active = groups.filter((g: any) => g.enabled);
  const others = groups.filter((g: any) => !g.enabled);
  const cfgId = sel?.mainGroupJid || active[0]?.id || "web";
  const ensayo = useEnsayo({ id: sel?.id ?? "", token: sel?.token ?? "" }, cfgId, adminMode);

  useEffect(() => { setDirty(false); setBig(null); }, [sel?.id]);

  const inFlow = ["connecting", "qr_pending", "pairing"].includes(sel?.status ?? "");
  useEffect(() => {
    if (!inFlow) return;
    const t = setInterval(() => revalidator.revalidate(), 2000);
    return () => clearInterval(t);
    // revalidator cambia de identidad en cada render: sólo nos interesa el flujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlow, sel?.id]);

  // Conectar WhatsApp Business: popup firmado de Formmy → Meta. La ventana se abre
  // SÍNCRONA dentro del clic (si esperas al fetch, el navegador la bloquea).
  const connectWaba = async (fleetAgentId: string) => {
    setWabaBusy(true);
    setWabaError(null);
    const popup = window.open("about:blank", "waba-connect", "width=600,height=760");
    try {
      const res = await fetch(`/api/v2/fleet-agents/${fleetAgentId}/waba/connect/start`, { method: "POST" });
      const { popupUrl, error } = await res.json().catch(() => ({} as any));
      // Si no hay URL, la ventana en blanco se queda ahí como un fantasma: hay que
      // cerrarla. Y el error del servidor viene en jerga (nombres de env vars) —
      // eso no se le enseña a quien está conectando su WhatsApp.
      if (!popupUrl) {
        try { popup?.close(); } catch {}
        const raw = String(error ?? "");
        throw new Error(
          /not set|secret|partner/i.test(raw)
            ? "La conexión con Meta no está configurada en este entorno (falta la credencial de socio). En producción sí funciona."
            : raw || "No se pudo abrir la conexión con Meta."
        );
      }
      if (popup) popup.location.href = popupUrl;
      const onMsg = async (e: MessageEvent) => {
        if (!/(^|\.)formmy\.app$/.test(new URL(e.origin).hostname)) return;
        const d = e.data as any;
        if (d?.type === "formmy-waba-error") {
          window.removeEventListener("message", onMsg);
          try { popup?.close(); } catch {}
          setWabaBusy(false);
          setWabaError(`Meta rechazó la conexión: ${d.error || "error desconocido"}`);
          return;
        }
        // Coexistencia no devuelve `code`, sólo wabaId + phoneNumberId.
        if (!d?.phoneNumberId || !d?.wabaId) return;
        window.removeEventListener("message", onMsg);
        try { popup?.close(); } catch {}
        const r = await fetch(`/api/v2/fleet-agents/${fleetAgentId}/waba/connect`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
        }).catch(() => null);
        setWabaBusy(false);
        if (!r || !r.ok) {
          const msg = r ? ((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`) : "sin conexión";
          setWabaError(`No se pudo guardar la conexión: ${msg}`);
          return;
        }
        revalidator.revalidate();
      };
      window.addEventListener("message", onMsg);
    } catch (e) {
      setWabaBusy(false);
      setWabaError(e instanceof Error ? e.message : "no se pudo abrir la conexión");
    }
  };

  // Alta de un MCP a mano: si trae llave, primero se guarda en la bóveda
  // (set-secret) y luego se registra el MCP referenciándola por nombre. Dos posts
  // al MISMO action, en orden — el registro nunca debe quedar apuntando a un
  // secreto que no llegó a guardarse.
  const createMcp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const secretName = String(fd.get("requiredSecret") || "").trim();
    const secretValue = String(fd.get("secretValue") || "").trim();
    setMcpBusy(true);
    setMcpError(null);
    const post = async (body: Record<string, string>) => {
      const res = await fetch("/dash/flota", { method: "POST", body: new URLSearchParams(body) });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j?.error) throw new Error(j?.error ?? `HTTP ${res.status}`);
    };
    try {
      if (secretName && secretValue) {
        await post({ intent: "set-secret", fleetAgentId: sel.id, name: secretName, value: secretValue });
      }
      await post({
        intent: "add-mcp", fleetAgentId: sel.id,
        name: String(fd.get("name") || ""), label: String(fd.get("label") || ""),
        pkg: String(fd.get("pkg") || ""), url: String(fd.get("url") || ""),
        requiredSecret: secretName,
      });
      setAddMcp(false);
      form.reset();
      revalidator.revalidate();
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : "no se pudo conectar");
    } finally {
      setMcpBusy(false);
    }
  };

  // `paths` va en paralelo a `files`: un File sólo lleva su basename, así que sin
  // esto "scripts/cotizar.mjs" llegaría como "cotizar.mjs" y el SKILL.md apuntaría
  // a un archivo que el agente no encuentra. Se quita la carpeta contenedora, igual
  // que al expandir el .zip.
  // Config POR CANAL: instrucciones propias + qué capacidades ve ahí. El loader ya
  // devuelve el mismo shape para un grupo, un número WABA, Teams y Web, así que este
  // bloque sirve para los cuatro. Vacío = hereda lo del agente; no es "sin nada".
  const ChannelConfig = ({ ch }: { ch: any }) => {
    const open = chanCfg === ch.id;
    // `mcps` viene del loader como `gconf[id]?.mcpServers ?? []`, así que un canal que
    // hereda y uno con lista propia vacía se ven igual desde aquí. Se distingue por si
    // difiere del default del agente o por tener otros ajustes propios.
    const own = (ch.mcps?.length ?? 0) > 0 &&
      JSON.stringify([...(ch.mcps ?? [])].sort()) !== JSON.stringify([...(sel.defaultMcps ?? [])].sort());
    const overrides = (ch.mcps?.length ?? 0) + (ch.disabledBuiltins?.length ?? 0) + (ch.systemPrompt ? 1 : 0);
    return (
      <div className={`mt-1 rounded-xl border-2 ${open ? "border-black" : "border-transparent"}`}>
        <button type="button" onClick={() => setChanCfg(open ? null : ch.id)}
          className="flex items-center gap-2 text-xs font-bold text-brand-500 hover:underline px-1 py-1">
          {open ? "▾" : "▸"} Cómo se comporta en este canal
          {overrides > 0 && !open && (
            <span className="font-semibold text-marengo">· {overrides} ajuste{overrides !== 1 ? "s" : ""} propio{overrides !== 1 ? "s" : ""}</span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="p-3 flex flex-col gap-4">
                <fetcher.Form method="post" action="/dash/flota" className="flex flex-col gap-1">
                  <input type="hidden" name="intent" value="set-group-prompt" />
                  <input type="hidden" name="fleetAgentId" value={sel.id} />
                  <input type="hidden" name="groupId" value={ch.id} />
                  <span className="text-xs font-semibold">Instrucciones sólo para este canal</span>
                  <textarea name="systemPrompt" defaultValue={ch.systemPrompt ?? ""} rows={3}
                    placeholder="Vacío = usa las instrucciones del agente. Lo que escribas aquí se SUMA, no las reemplaza."
                    className="eb-thin border-2 border-gray-200 rounded-xl p-2 text-sm font-mono resize-y focus:outline-none focus:border-brand-500" />
                  <button type="submit" className="self-start mt-1 border-2 border-black rounded-lg px-3 py-1 text-xs font-bold bg-brand-500 text-white">
                    Guardar
                  </button>
                </fetcher.Form>

                <div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs font-semibold">Capacidades en este canal</p>
                    {/* Heredar u override es TODO O NADA (así lo resuelve el worker:
                        `cfg.mcpServers ?? default`), no un merge. Si no se dice, tocar
                        un canal lo desengancha del agente para siempre sin avisar. */}
                    {own ? (
                      <button type="button" onClick={() => submit({ intent: "inherit-group-mcps", groupId: ch.id })}
                        className="text-[11px] font-bold text-brand-500 underline underline-offset-2">
                        volver a seguir al agente
                      </button>
                    ) : (
                      <span className="text-[11px] text-tale">sigue al agente</span>
                    )}
                  </div>
                  <p className="text-[11px] text-tale mb-1.5">
                    {own
                      ? "Este canal tiene su PROPIA lista: lo que cambies en Capacidades ya no le llega."
                      : "Hereda de Capacidades. En cuanto toques algo aquí, este canal deja de seguir al agente y manda esta lista."}
                  </p>
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {(sel.builtins ?? []).map((b: any) => {
                      const off = (ch.disabledBuiltins ?? []).includes(b.name);
                      return (
                        <li key={b.name} className="flex items-center gap-2.5 border-2 border-gray-200 rounded-lg px-2.5 py-2">
                          <Toggle on={!off} busy={fetcher.state !== "idle"}
                            onClick={() => submit({ intent: "toggle-group-builtin", groupId: ch.id, name: b.name, on: off ? "1" : "0" })} />
                          <span className="text-xs font-semibold truncate" title={b.label}>{b.label}</span>
                        </li>
                      );
                    })}
                    {(sel.capabilities ?? []).map((c: any) => {
                      const on = (ch.mcps ?? []).includes(c.name);
                      const level = ch.capLevels?.[c.name] ?? "";
                      return (
                        <li key={c.name} className="flex flex-col gap-1.5 border-2 border-gray-200 rounded-lg px-2.5 py-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Toggle on={on} busy={fetcher.state !== "idle" || !c.secretsPresent}
                              onClick={() => submit({ intent: "toggle-group-mcp", groupId: ch.id, mcp: c.name, on: on ? "0" : "1" })} />
                            <span className="text-xs font-semibold truncate" title={c.label}>{c.label}</span>
                          </div>
                          {/* Nivel de acceso (cuando el conector declara varios) EN SU
                              LÍNEA: compitiendo con el nombre, ambos salían cortados. */}
                          {on && c.levels?.length > 0 && (
                            <select value={level} onChange={(e) => submit({ intent: "set-cap-level", groupId: ch.id, mcp: c.name, level: e.target.value })}
                              className="w-full border-2 border-gray-200 rounded-lg px-2 py-1 text-[11px] font-semibold bg-white hover:border-black focus:outline-none">
                              <option value="">acceso completo</option>
                              {c.levels.map((l: any) => <option key={l.key} value={l.key}>{l.label}</option>)}
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[11px] text-tale mt-1.5">
                    Esto manda sobre lo que elegiste para todo el agente.
                  </p>
                </div>

                {/* A CUÁL base puede entrar en este canal. Sin elegir ninguna ve todas
                    las tuyas: por eso la lista importa aunque parezca opcional. */}
                {ownerDbs && ownerDbs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold">Bases de datos</p>
                    <p className="text-[11px] text-tale mb-1.5">
                      {(ch.dbAllow ?? []).length === 0
                        ? "Ninguna elegida: en este canal puede consultar TODAS tus bases."
                        : `Sólo estas ${(ch.dbAllow ?? []).length}; el resto de tus bases quedan fuera de su alcance.`}
                    </p>
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ownerDbs.map((d) => {
                        const on = (ch.dbAllow ?? []).includes(d.namespace);
                        return (
                          <li key={d.namespace} className="flex items-center gap-2.5 border-2 border-gray-200 rounded-lg px-2.5 py-2">
                            <Toggle on={on} busy={fetcher.state !== "idle"}
                              onClick={() => submit({ intent: "set-db-allow", groupId: ch.id, namespace: d.namespace, on: on ? "0" : "1" })} />
                            <span className="text-xs font-semibold truncate" title={d.namespace}>{d.name || d.namespace}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const [ownerDbs, setOwnerDbs] = useState<Array<{ name: string; namespace: string }> | null>(null);
  useEffect(() => {
    setOwnerDbs(null);
    if (!sel?.id || !sel?.token) return;
    let alive = true;
    fetch(`/api/v2/fleet-agents/${sel.id}/capabilities`, { headers: { Authorization: `Bearer ${sel.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setOwnerDbs(d.ownerDbs ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sel?.id, sel?.token]);

  const sendSkill = (entries: Array<{ file: File; path?: string }>) => {
    if (!entries.length) return;
    const rels = entries.map((e) => (e.path || e.file.name).replace(/^\/+/, ""));
    const roots = new Set(rels.map((r) => r.split("/")[0]));
    const strip = roots.size === 1 && rels.every((r) => r.includes("/"));
    const fd = new FormData();
    fd.set("intent", "add-skill");
    fd.set("fleetAgentId", sel.id);
    entries.forEach((e, i) => {
      fd.append("files", e.file);
      fd.append("paths", strip ? rels[i].split("/").slice(1).join("/") : rels[i]);
    });
    fetcher.submit(fd, { method: "post", action: "/dash/flota", encType: "multipart/form-data" });
  };

  // Arrastrar una CARPETA: el DataTransfer sólo da FileSystemEntry, hay que
  // recorrerlo. Sin esto, soltar una carpeta no hacía absolutamente nada.
  const readDropped = async (dt: DataTransfer): Promise<Array<{ file: File; path?: string }>> => {
    const items = Array.from(dt.items ?? []);
    const roots = items.map((it) => (it as any).webkitGetAsEntry?.()).filter(Boolean);
    if (!roots.length) return Array.from(dt.files ?? []).map((file) => ({ file }));
    const out: Array<{ file: File; path?: string }> = [];
    const walk = async (entry: any, prefix: string): Promise<void> => {
      if (entry.isFile) {
        const file: File = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ file, path: `${prefix}${entry.name}` });
        return;
      }
      const reader = entry.createReader();
      // readEntries devuelve por tandas: hay que llamarlo hasta que venga vacío.
      let batch: any[];
      do {
        batch = await new Promise<any[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    };
    for (const r of roots) await walk(r, "");
    return out;
  };

  if (!sel) {
    return (
      <main className="p-8">
        <p className="text-sm text-marengo">
          Aún no tienes agentes. Créalos desde <a className="text-brand-500 font-bold underline" href="/dash/flota-clasica">la vista clásica</a>.
        </p>
      </main>
    );
  }

  const state = agentState(sel);
  const waConnected = sel.status === "connected" && sel.live;
  const submit = (fields: Record<string, string>) =>
    fetcher.submit({ ...fields, fleetAgentId: sel.id }, { method: "post", action: "/dash/flota" });

  // Los canales son VARIOS y salen de la fuente única. Añadir Slack mañana = una
  // entrada más en channelsOf(), sin tocar la UI.
  const CHANNELS = channelsOf(sel);

  const promptEditor = (
    <Suspense fallback={<div className="flex-1 min-h-[260px] rounded-lg border-2 border-gray-200 p-4"><Skeleton lines={12} /></div>}>
      <PromptEditor name="systemPrompt" defaultValue={sel.agentPrompt ?? ""} onDirty={() => setDirty(true)} defaultMode="preview" />
    </Suspense>
  );

  return (
    // La SideBar del dash es `fixed w-20` (NO ocupa espacio en el flujo), así que
    // la página debe dejarle su carril con padding izquierdo. Las vistas viejas lo
    // esquivan con `max-w-7xl mx-auto`, que centra y de paso desperdicia los lados;
    // aquí usamos todo el ancho y sólo apartamos los 80px de la sidebar.
    <div className="w-full py-6 pr-6 pl-6 md:pl-[6.5rem] text-onix">
      {/* Barras de scroll finas y de la marca — las nativas de macOS/Windows se ven
          como un parche gris encima del panel. */}
      <style>{`
        .eb-thin { scrollbar-width: thin; scrollbar-color: #C9C7C4 transparent; }
        .eb-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .eb-thin::-webkit-scrollbar-thumb { background: #C9C7C4; border-radius: 99px; }
        .eb-thin::-webkit-scrollbar-track { background: transparent; }
        .eb-prompt-editor .w-md-editor { border: 2px solid #E5E7EB; border-radius: 12px; box-shadow: none; }
      `}</style>

        <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tu flota</h1>
            <p className="text-sm text-marengo mt-1">
              {pools.length} agente{pools.length !== 1 ? "s" : ""} · plan {capacity?.planName}
            </p>
          </div>
          <div className="flex items-end gap-6">
            <Boxes pools={pools} capacity={capacity} />
            <button type="button" onClick={() => setCreating(true)}
              className="shrink-0 border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-500 text-white shadow-[2px_2px_0_0_#000]">
              + Nuevo agente
            </button>
            <a href="/dash/flota-clasica" className="text-xs font-bold text-marengo underline underline-offset-2 pb-1">vista clásica</a>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_minmax(360px,26vw)] gap-4 items-start">
          {/* ── Roster ─────────────────────────────────────────────────── */}
          <nav className="flex flex-col gap-1.5">
            {pools.map((p: any) => {
              const st = agentState(p);
              const on = p.id === sel.id;
              return (
                <button key={p.id} onClick={() => setSelId(p.id)}
                  className={`text-left flex items-center gap-3 p-2.5 rounded-2xl border-2 transition-colors ${on ? "border-black bg-white" : "border-transparent hover:bg-white/70"}`}>
                  <Avatar color={p.mascotColor} state={st} size={40} />
                  <div className="min-w-0 flex-1">
                    {/* Sin puntito: el avatar YA dice el estado (se mueve, duerme,
                        se apaga) y un punto de color al lado sólo pedía descifrar
                        otro código. El texto de abajo lo dice con palabras. */}
                    <span className="block font-bold text-sm truncate">{p.name || "sin nombre"}</span>
                    <p className="text-[11px] text-marengo truncate">
                      {p.conversations} conv. · {LABEL[st]}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* ── Config del agente ──────────────────────────────────────── */}
          <div className="flex flex-col gap-4 min-w-0">
            <div className="border-2 border-black rounded-2xl bg-white p-4">
              <div className="flex items-center gap-4">
                <Avatar color={sel.mascotColor} state={state} size={60} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Renombrar en el sitio: se guarda al salir del campo (mismo
                        patrón que la vista clásica), sin botón ni modal. */}
                    <input key={`n-${sel.id}`} defaultValue={sel.name || ""} placeholder="sin nombre"
                      onBlur={(e) => { const v = e.target.value.trim();
                        if (v && v !== (sel.name || "")) submit({ intent: "rename", name: v }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      className="text-xl font-bold bg-transparent border-2 border-transparent rounded-lg px-1 -ml-1 min-w-0 w-44 hover:border-gray-200 focus:border-black focus:outline-none" />
                    {(() => {
                      // "canal caído" no decía nada accionable: ahora nombra el canal
                      // que se cayó y el badge lleva a su pestaña para reconectarlo.
                      const broken = CHANNELS.find((c) => c.state === "configured");
                      if (state === "down" && broken) return (
                        <button type="button" onClick={() => setTab(`ch:${broken.kind}`)}
                          className="text-xs font-semibold px-2 py-0.5 rounded-full border-2 border-black bg-brand-pink hover:bg-brand-yellow transition-colors">
                          {broken.label} sin conexión →
                        </button>
                      );
                      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full border-2 border-black">{LABEL[state]}</span>;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-marengo mt-1">
                    <span>{sel.conversations} conversaciones</span>
                    <span>·</span>
                    <span>{sel.vms} caja{sel.vms !== 1 ? "s" : ""}</span>
                    {/* Cerebro: motor + modelo. Aplican al reciclar la caja del agente
                        (el env se hornea en el spawn), así que se avisa en el title. */}
                    {sel.engineId && (() => {
                      const eng = FLEET_ENGINES.find((x) => x.id === sel.engineId);
                      if (!eng) return null;
                      return (<>
                        <span>·</span>
                        <select value={sel.engineId} title="Motor del agente — aplica al reciclar su caja"
                          onChange={(e) => submit({ intent: "set-engine", engine: e.target.value })}
                          className="border-2 border-gray-200 rounded-lg px-1.5 py-0.5 text-xs font-semibold bg-white hover:border-black focus:outline-none">
                          {FLEET_ENGINES.map((x) => (
                            <option key={x.id} value={x.id} disabled={!engineCreatable(x)}>{x.label}</option>
                          ))}
                        </select>
                        {eng.models.length > 1 && (
                          <select value={sel.agentModel ?? eng.defaultModel ?? ""} title="Modelo — aplica al reciclar su caja"
                            onChange={(e) => submit({ intent: "set-model", model: e.target.value })}
                            className="border-2 border-gray-200 rounded-lg px-1.5 py-0.5 text-xs font-semibold bg-white hover:border-black focus:outline-none">
                            {eng.models.map((m) => (
                              <option key={m.id} value={m.id} disabled={m.ready === false}>
                                {m.label}{m.ready === false ? " · próximamente" : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </>);
                    })()}
                    <button type="button" onClick={() => setKillAgent(true)}
                      className="ml-auto text-[11px] font-semibold text-tale hover:text-brand-red underline underline-offset-2">
                      borrar agente
                    </button>
                  </div>
                </div>
              </div>

              {/* Izquierda: lo del AGENTE. Derecha: un tab por CANAL, con su punto de
                  estado y su conteo. Una fila, un solo nivel. */}
              <div className="flex flex-wrap items-center gap-x-1 mt-4 border-b-2 border-gray-100">
                {(["instrucciones", "capacidades"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-2 text-sm font-bold border-b-2 -mb-0.5 capitalize whitespace-nowrap transition-colors ${tab === t ? "border-brand-500 text-brand-500" : "border-transparent text-tale hover:text-onix"}`}>
                    {t}
                  </button>
                ))}
                <span className="w-px h-5 bg-gray-200 mx-2 shrink-0" />
                {CHANNELS.map((c) => {
                  const k = `ch:${c.kind}`;
                  return (
                    <button key={k} onClick={() => setTab(k)} title={CH_HINT[c.state]}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 -mb-0.5 whitespace-nowrap transition-colors ${tab === k ? "border-brand-500 text-brand-500" : "border-transparent text-tale hover:text-onix"}`}>
                      <i className={`w-1.5 h-1.5 rounded-full not-italic ${CH_DOT[c.state]}`} />
                      {c.label}
                      {c.count > 0 && <b className="text-[11px] text-marengo">{c.count}</b>}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={tab + sel.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }} className="flex flex-col gap-4 min-w-0">

                {tab === "instrucciones" && (
                  <Card title="Instrucciones"
                    right={
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-marengo hidden lg:inline">
                          {((sel.agentPrompt ?? "").length / 1024).toFixed(1)} KB · las heredan todos sus canales
                        </span>
                        <button type="submit" form="prompt-form" disabled={!dirty || fetcher.state !== "idle"}
                          className="border-2 border-black rounded-xl px-3 py-1 text-xs font-bold bg-brand-500 text-white disabled:opacity-40">
                          Guardar
                        </button>
                        <Expand onClick={() => setBig("prompt")} label="Editar en grande" />
                      </div>
                    }>
                    <fetcher.Form id="prompt-form" method="post" action="/dash/flota" key={`p-${sel.id}`}
                      className="flex flex-col min-h-[62vh]" onSubmit={() => setDirty(false)}>
                      <input type="hidden" name="intent" value="set-agent-prompt" />
                      <input type="hidden" name="fleetAgentId" value={sel.id} />
                      {promptEditor}
                      <p className="text-xs text-marengo mt-3">
                        Aplica al siguiente turno — no hace falta reiniciar nada.
                      </p>
                    </fetcher.Form>
                  </Card>
                )}

                {tab.startsWith("ch:") && (
                  <Card title={CHANNELS.find((c) => `ch:${c.kind}` === tab)?.label ?? "Canal"}
                    right={
                      <span className="flex items-center gap-1.5 text-xs text-marengo">
                        <i className={`w-1.5 h-1.5 rounded-full not-italic ${CH_DOT[CHANNELS.find((c) => `ch:${c.kind}` === tab)?.state ?? "off"]}`} />
                        {CH_HINT[CHANNELS.find((c) => `ch:${c.kind}` === tab)?.state ?? "off"]}
                      </span>
                    }>
                    {tab === "ch:baileys" && (<>
                      {!waConnected && (
                        <p className="text-xs bg-brand-yellow/40 border-2 border-black rounded-xl px-3 py-2 mb-3">
                          WhatsApp está desconectado. <b>Tu configuración sigue aquí</b> — el agente
                          vuelve a responder en cuanto vincules la sesión.
                        </p>
                      )}
                      {/* Vincular sin salir de la página: QR o código por número. */}
                      {!waConnected && (
                        <div className="mb-3 flex flex-col gap-3">
                          {sel.qrDataUrl && (
                            <div className="flex items-center gap-4">
                              <img src={sel.qrDataUrl} alt="QR de WhatsApp" className="w-40 h-40 border-2 border-black rounded-xl" />
                              <p className="text-xs text-marengo">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                            </div>
                          )}
                          {sel.pairingCode && (
                            <div className="flex items-center gap-4">
                              <div className="text-2xl font-mono font-bold tracking-widest border-2 border-black rounded-xl px-3 py-2">{sel.pairingCode}</div>
                              <p className="text-xs text-marengo">WhatsApp → Dispositivos vinculados → Vincular con número → teclea este código</p>
                            </div>
                          )}
                          {sel.throttledUntil ? (
                            <p className="text-xs text-brand-red">
                              WhatsApp bloqueó este número por demasiados intentos. Reintenta después de las{" "}
                              <b>{new Date(sel.throttledUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b> (cada intento extiende el bloqueo).
                            </p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex rounded-xl border-2 border-black overflow-hidden shrink-0">
                                {([["qr", "QR"], ["code", "Código"]] as const).map(([m, label]) => (
                                  <button key={m} type="button" onClick={() => setPairMode(m)}
                                    className={`px-3 py-1.5 text-sm font-bold transition-colors ${pairMode === m ? "bg-black text-white" : "bg-white text-marengo hover:bg-grayLight"}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {pairMode === "code" && (
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="52155…"
                                  className="border-2 border-black rounded-xl px-2 py-1.5 text-sm w-32 font-mono focus:outline-none" />
                              )}
                              <button type="button"
                                disabled={inFlow || fetcher.state !== "idle" || (pairMode === "code" && !phone.trim())}
                                onClick={() => submit(pairMode === "code" ? { intent: "connect", phone } : { intent: "connect" })}
                                className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-bold bg-brand-500 text-white disabled:opacity-50">
                                {inFlow ? "Generando…" : "Vincular"}
                              </button>
                              <span className="text-xs text-tale">
                                {pairMode === "qr" ? "Escaneas un código desde tu teléfono" : "Recibes un código de 8 letras y lo tecleas en WhatsApp"}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {groups.length === 0 ? (
                        <p className="text-xs text-tale">Todavía no se ven grupos. Aparecen solos en cuanto le escriban.</p>
                      ) : (
                        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                          {[...active, ...(showAll ? others.filter((g: any) => !groupQ.trim() || g.subject.toLowerCase().includes(groupQ.trim().toLowerCase())) : [])].map((g: any) => (
                            <li key={g.id} className={`min-w-0 flex flex-col ${chanCfg === g.id ? "sm:col-span-2" : ""}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <Toggle on={g.enabled} busy={fetcher.state !== "idle"}
                                  onClick={() => submit({ intent: "toggle-group", groupId: g.id, on: g.enabled ? "0" : "1" })} />
                                <span className={`flex-1 text-sm truncate ${g.enabled ? "font-bold" : "text-marengo"}`}>{g.subject}</span>
                                {g.enabled && (
                                  <button onClick={() => submit({ intent: "set-main", groupId: g.id })}
                                    title="El grupo main puede administrar al agente"
                                    className={`text-xs font-bold px-2 py-1 rounded-lg border-2 shrink-0 ${sel.mainGroupJid === g.id ? "border-black bg-brand-500 text-white" : "border-gray-200 text-tale hover:border-black hover:text-onix"}`}>
                                    {sel.mainGroupJid === g.id ? "★" : "☆"}
                                  </button>
                                )}
                              </div>
                              {/* Sólo tiene sentido afinar un canal que atiende. */}
                              {g.enabled && <ChannelConfig ch={g} />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {waConnected && (
                        <button type="button" onClick={() => submit({ intent: "disconnect" })}
                          className="mt-3 ml-auto block text-xs font-bold text-marengo hover:text-brand-red underline underline-offset-2">
                          Desconectar WhatsApp
                        </button>
                      )}
                      {showAll && others.length > 8 && (
                        <input value={groupQ} onChange={(e) => setGroupQ(e.target.value)}
                          placeholder={`Buscar entre ${others.length} grupos…`}
                          className="mt-3 w-full sm:w-72 border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-black" />
                      )}
                      {others.length > 0 && (
                        <button onClick={() => setShowAll((s) => !s)} className="mt-3 block text-xs font-bold text-brand-500 hover:underline">
                          {showAll ? "Ocultar los que no atiende" : `+ ${others.length} grupo${others.length !== 1 ? "s" : ""} que no atiende`}
                        </button>
                      )}
                      {active.length === 0 && groups.length > 0 && (
                        <p className="text-xs text-brand-red mt-3">Sin grupos activos no responde a nadie (protección anti-spam).</p>
                      )}
                    </>)}

                    {tab === "ch:waba" && (
                      (sel.wabaNumbers?.length ?? 0) === 0 ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-marengo">Conecta un número de WhatsApp Business para que este agente lo atienda.</p>
                          <button type="button" disabled={wabaBusy} onClick={() => connectWaba(sel.id)}
                            className="self-start border-2 border-black rounded-xl px-3 py-1.5 text-sm font-bold bg-brand-500 text-white disabled:opacity-50">
                            {wabaBusy ? "Conectando…" : "Conectar WhatsApp Business"}
                          </button>
                          {wabaError && <p className="text-xs text-brand-red">⚠️ {wabaError}</p>}
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {sel.wabaNumbers.map((w: any) => (
                            <li key={w.id} className="flex flex-col gap-2 border-2 border-gray-200 rounded-xl px-3 py-2.5">
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${w.mode === "off" ? "bg-gray-300" : "bg-emerald"}`} />
                                <input key={`wn-${w.id}`} defaultValue={w.name || ""} placeholder={w.subject}
                                  onBlur={(e) => { const v = e.target.value.trim();
                                    if (v !== (w.name || "")) submit({ intent: "set-waba-identity", integrationId: w.integrationId, name: v }); }}
                                  className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-2 border-transparent rounded-lg px-1 hover:border-gray-200 focus:border-black focus:outline-none" />
                                <span className="text-[11px] text-tale shrink-0 font-mono">{w.phoneNumber || w.integrationId}</span>
                                <button type="button" onClick={() => setInbox(w)}
                                  className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border-2 border-gray-200 hover:border-black hover:text-onix text-marengo">
                                  Conversaciones
                                </button>
                                {/* Tres modos, no un texto: apagado / sólo permitidos / todos. */}
                                <div className="flex rounded-lg border-2 border-black overflow-hidden shrink-0">
                                  {([["off", "Apagado"], ["only", "Sólo permitidos"], ["all", "Todos"]] as const).map(([m, label]) => (
                                    <button key={m} type="button" onClick={() => submit({ intent: "set-waba-mode", integrationId: w.integrationId, mode: m })}
                                      className={`px-2 py-1 text-[11px] font-bold transition-colors ${w.mode === m ? "bg-black text-white" : "bg-white text-marengo hover:bg-grayLight"}`}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <ChannelConfig ch={w} />
                            </li>
                          ))}
                          <li>
                            <button type="button" disabled={wabaBusy} onClick={() => connectWaba(sel.id)}
                              className="text-xs font-bold text-brand-500 hover:underline disabled:opacity-50">
                              {wabaBusy ? "Conectando…" : "+ Agregar otro número"}
                            </button>
                            {wabaError && <p className="text-xs text-brand-red mt-1">⚠️ {wabaError}</p>}
                          </li>
                        </ul>
                      )
                    )}

                    {tab === "ch:teams" && (<>
                      <p className="text-xs text-marengo">
                        {sel.teamsChannel?.connected
                          ? "Recibe turnos desde Ghosty Teams."
                          : "Se conecta desde Ghosty Teams: Ajustes → Agentes → conectar este agente de la flota. Aquí sólo configuras su comportamiento en ese canal."}
                      </p>
                      <ChannelConfig ch={sel.teamsChannel} />
                    </>)}

                    {tab === "ch:web" && (<>
                      <p className="text-xs text-marengo mb-3">
                        {sel.webChannel?.connected
                          ? "Las burbujas web ya reciben turnos. Todas comparten una sola configuración."
                          : "No hay nada que \"conectar\": el canal web se activa solo cuando tu sitio postea a este agente. Todas las burbujas comparten una configuración."}
                      </p>
                      {/* El canal web NO es un webhook: no llamamos a tu servidor, tú
                          llamas al agente. Sin esto la pestaña decía "recibiendo" y no
                          daba forma de usarlo. El token va SIEMPRE server-side: da
                          control total del agente. */}
                      <div className="flex flex-col gap-2 border-2 border-gray-200 rounded-xl p-3 mb-1">
                        <p className="text-xs font-semibold">Cómo le hablas desde tu sitio</p>
                        <pre className="eb-thin text-[11px] font-mono bg-grayLight border-2 border-gray-200 rounded-lg p-2.5 overflow-x-auto">{`curl -N https://www.easybits.cloud/api/v2/fleet-agents/${sel.id}/message-stream \\
  -H "Authorization: Bearer $EASYBITS_FLEET_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"groupId":"web-<id-de-la-visita>","configGroupId":"web","text":"hola"}'`}</pre>
                        <div className="flex flex-wrap items-center gap-2">
                          <CopyButton value={sel.token} label="Copiar token" />
                          <code className="text-[11px] font-mono text-marengo">{sel.token.slice(0, 6)}••••••</code>
                        </div>
                        <p className="text-[11px] text-marengo">
                          <b>/message-stream</b> devuelve SSE (<code>chunk</code> y <code>done</code>; el
                          texto bueno es el de <code>done</code>). Sin streaming, <b>/message</b> devuelve{" "}
                          <code>{"{reply}"}</code> de una vez.
                        </p>
                        <p className="text-[11px] text-marengo">
                          <code>groupId</code> identifica la conversación (uno por visitante, y la memoria
                          se conserva entre turnos). <code>configGroupId: "web"</code> es lo que hace que
                          el turno arranque con la configuración de abajo: <b>sin él el agente responde sin
                          sus conectores</b>.
                        </p>
                        <p className="text-[11px] text-brand-red font-semibold">
                          El token da control total del agente: llámalo desde tu servidor, nunca desde el
                          navegador del visitante.
                        </p>
                      </div>
                      <ChannelConfig ch={sel.webChannel} />
                    </>)}
                  </Card>
                )}

                {tab === "capacidades" && (
                  <Card title="Capacidades" right={<span className="text-xs text-marengo">valen para todos sus canales</span>}>
                    <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {(sel.builtins ?? []).map((b: any) => (
                        <li key={b.name}>
                          <button type="button" onClick={() => setCapInfo({ ...b, builtin: true })}
                            className="w-full text-left flex items-center gap-3 border-2 border-gray-200 rounded-xl px-3 py-2 bg-grayLight hover:border-black transition-colors">
                            <span className="w-8 text-center text-xs font-bold text-emerald shrink-0">✓</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold line-clamp-2">{b.label}</p>
                              <p className="text-[11px] text-tale">siempre activa · no se apaga</p>
                            </div>
                          </button>
                        </li>
                      ))}
                      {(sel.capabilities ?? []).map((c: any) => {
                        const on = (sel.defaultMcps ?? []).includes(c.name);
                        const open = creds === c.name;
                        return (
                          <li key={c.name} className={`border-2 rounded-xl px-3 py-2 ${open ? "border-black sm:col-span-2 xl:col-span-3" : "border-gray-200"}`}>
                            <div className="flex items-center gap-3">
                              <Toggle on={on} busy={fetcher.state !== "idle" || !c.secretsPresent}
                                onClick={() => submit({ intent: "toggle-group-mcp", groupId: "*", mcp: c.name, on: on ? "0" : "1" })} />
                              <div className="min-w-0 flex-1">
                                <button type="button" onClick={() => setCapInfo(c)}
                                  className="text-sm font-semibold line-clamp-2 text-left hover:underline underline-offset-2">
                                  {c.label}
                                </button>
                                {c.custom && !open && (
                                  <button type="button"
                                    onClick={() => submit({ intent: "remove-mcp", name: c.name })}
                                    className="float-right text-[11px] text-tale hover:text-brand-red underline underline-offset-2">
                                    quitar
                                  </button>
                                )}
                                {!c.secretsPresent && (
                                  // La credencial se pide AQUÍ MISMO: mandar al vault por
                                  // una llave es perder el hilo de lo que estabas haciendo.
                                  <button type="button" onClick={() => setCreds(open ? null : c.name)}
                                    className="text-[11px] text-brand-red font-semibold underline underline-offset-2">
                                    {open ? "cancelar" : "conectar credencial"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <AnimatePresence initial={false}>
                              {open && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden">
                                  <div className="pt-3 flex flex-col gap-3">
                                    {(c.missingSecrets ?? []).map((n: string) => {
                                      const f = c.secretFields?.[n] ?? {};
                                      return (
                                        <fetcher.Form key={n} method="post" action="/dash/flota" className="flex flex-col gap-1"
                                          onSubmit={() => setCreds(null)}>
                                          <input type="hidden" name="intent" value="set-secret" />
                                          <input type="hidden" name="fleetAgentId" value={sel.id} />
                                          <input type="hidden" name="name" value={n} />
                                          <label className="text-xs font-semibold">{f.label ?? n}</label>
                                          {f.help && <p className="text-[11px] text-tale">{f.help}</p>}
                                          <div className="flex gap-2">
                                            <input name="value" type="password" autoComplete="off" required
                                              placeholder="pega aquí el valor"
                                              className="flex-1 border-2 border-black rounded-xl px-3 py-1.5 text-sm focus:outline-none" />
                                            <button type="submit" className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-bold bg-brand-500 text-white">
                                              Guardar
                                            </button>
                                          </div>
                                        </fetcher.Form>
                                      );
                                    })}
                                    <p className="text-[11px] text-tale">
                                      Se guarda cifrada en tu bóveda de secretos; el agente sólo la usa por nombre.
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Conectar un MCP que no está en el catálogo — lo que pidió
                        Oswaldo: cualquier servidor MCP (paquete npm o URL), con su
                        credencial opcional guardada en la bóveda. */}
                    <div className="mt-4 pt-4 border-t-2 border-gray-100">
                      <button type="button" onClick={() => setAddMcp((v) => !v)}
                        className="text-xs font-bold text-brand-500 hover:underline">
                        {addMcp ? "cancelar" : "+ Conectar otro MCP"}
                      </button>
                      <AnimatePresence initial={false}>
                        {addMcp && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden">
                            <form onSubmit={createMcp} className="pt-3 flex flex-col gap-4">
                              <div className="grid sm:grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1">
                                  <span className="text-xs font-semibold">Nombre corto</span>
                                  <input name="name" required placeholder="mi-crm" pattern="[a-zA-Z0-9_-]+"
                                    className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none" />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-xs font-semibold">Cómo se llama para ti</span>
                                  <input name="label" placeholder="Mi CRM"
                                    className="border-2 border-black rounded-xl px-3 py-1.5 text-sm focus:outline-none" />
                                </label>
                              </div>

                              <div>
                                <p className="text-xs font-semibold mb-1">¿Dónde vive? — llena sólo uno</p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                  <input name="pkg" placeholder="paquete npm · @mi-empresa/mcp"
                                    className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none" />
                                  <input name="url" placeholder="URL http · https://…/mcp"
                                    className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none" />
                                </div>
                              </div>

                              {/* La confusión anterior: el campo pedía el NOMBRE de la
                                  variable y parecía pedir la llave. Son dos cosas — el
                                  nombre lo dice la documentación del MCP, el valor lo
                                  tienes tú — así que se piden por separado y con su
                                  ejemplo. El valor se guarda cifrado en tu bóveda. */}
                              <div>
                                <p className="text-xs font-semibold mb-1">¿Necesita una llave? (opcional)</p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                  <label className="flex flex-col gap-1">
                                    <input name="requiredSecret" placeholder="MI_CRM_API_KEY" pattern="[A-Z_][A-Z0-9_]*"
                                      className="border-2 border-black rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none" />
                                    <span className="text-[11px] text-tale">Nombre de la variable que el MCP lee — lo dice su documentación.</span>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <input name="secretValue" type="password" autoComplete="off" placeholder="pega aquí la llave"
                                      className="border-2 border-black rounded-xl px-3 py-1.5 text-sm focus:outline-none" />
                                    <span className="text-[11px] text-tale">Se guarda cifrada en tu bóveda; el agente sólo la usa por nombre.</span>
                                  </label>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <button type="submit" disabled={mcpBusy}
                                  className="border-2 border-black rounded-xl px-4 py-1.5 text-sm font-bold bg-brand-500 text-white disabled:opacity-50">
                                  {mcpBusy ? "Conectando…" : "Conectar MCP"}
                                </button>
                                {mcpError && <p className="text-xs text-brand-red">⚠️ {mcpError}</p>}
                              </div>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Skills: instrucciones + archivos empaquetados (el patrón de
                        SIIQTEC/tania-0). Se encienden y apagan como una capacidad. */}
                    <div className="mt-4 pt-4 border-t-2 border-gray-100">
                      <p className="text-xs font-bold mb-2">Skills</p>
                      {/* Subir un skill es la acción principal de esta sección, así que
                          es una ZONA, no un enlace perdido en la esquina: acepta arrastrar
                          la carpeta comprimida y dice en el mismo sitio qué formato espera
                          y de dónde sacar una plantilla que ya lo cumple. */}
                      {/* ⚠️ Esto NO puede ser un <label>: el control asociado a un label
                          es el PRIMER descendiente "labelable", y un <button> lo es — así
                          que cualquier clic en la caja activaba el botón de la plantilla
                          en vez de abrir el selector, y cada clic descargaba el .zip.
                          Con un div + ref el disparo es explícito. */}
                      <div role="button" tabIndex={0}
                        onClick={() => skillInput.current?.click()}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); skillInput.current?.click(); } }}
                        onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
                        onDragLeave={() => setDropping(false)}
                        onDrop={async (e) => { e.preventDefault(); setDropping(false); sendSkill(await readDropped(e.dataTransfer)); }}
                        className={`flex flex-col items-center gap-1 text-center rounded-2xl border-2 border-dashed px-4 py-5 cursor-pointer transition-colors ${dropping ? "border-brand-500 bg-brand-100" : "border-gray-300 hover:border-black hover:bg-grayLight"}`}>
                        <svg className="w-6 h-6 text-marengo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        <span className="text-sm font-bold">
                          {fetcher.state !== "idle" ? "Subiendo…" : "Arrastra tu skill aquí o haz clic"}
                        </span>
                        <span className="text-[11px] text-tale max-w-lg">
                          La carpeta comprimida (<b>.zip</b>) o los archivos sueltos. Formato <b>Agent Skills</b>:
                          un <b>SKILL.md</b> con <code>name</code> y <code>description</code> en su frontmatter, más
                          los scripts que use. El agente sólo ve nombre y descripción hasta que necesita abrirlo.
                        </span>

                        <input ref={skillInput} type="file" multiple accept=".zip,.md,.mjs,.js,.json,.csv,.txt,.pdf" className="hidden"
                          onChange={(e) => { sendSkill(Array.from(e.target.files ?? []).map((file) => ({ file }))); e.target.value = ""; }} />
                      </div>
                      <p className="mt-2 mb-3 text-[11px] text-marengo">
                        ¿No sabes por dónde empezar?{" "}
                        <button type="button"
                          onClick={() => {
                            // La plantilla se arma en el cliente para que nunca se
                            // desincronice de lo que el alta sabe leer.
                            const url = URL.createObjectURL(zipStore([
                              { path: "cotizacion/SKILL.md", content: SKILL_TEMPLATE },
                              { path: "cotizacion/scripts/cotizar.mjs", content: SKILL_SCRIPT },
                            ]));
                            const a = document.createElement("a");
                            a.href = url; a.download = "skill-plantilla.zip"; a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="font-bold text-brand-500 underline underline-offset-2">
                          descarga la plantilla
                        </button>{" "}
                        y edítala.
                      </p>
                      {(sel.skills ?? []).length === 0 ? (
                        <p className="text-xs text-tale">Todavía no tiene skills. También puedes copiar uno de otro agente desde su fila.</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {sel.skills.map((sk: any) => (
                            <li key={sk.id} className="flex items-start gap-3 border-2 border-gray-200 rounded-xl px-3 py-2.5">
                              <Toggle on={sk.enabled} busy={fetcher.state !== "idle"}
                                onClick={() => submit({ intent: "toggle-skill", skillId: sk.id, on: sk.enabled ? "0" : "1" })} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{sk.name}</p>
                                {sk.description && <p className="text-[11px] text-tale line-clamp-2">{sk.description}</p>}
                              </div>
                              {sk.files?.length > 0 && (
                                <span className="text-[11px] text-marengo shrink-0 mt-0.5 whitespace-nowrap">
                                  {sk.files.length} archivo{sk.files.length !== 1 ? "s" : ""}
                                </span>
                              )}
                              {/* Bajar el skill tal cual (SKILL.md + sus archivos) para
                                  versionarlo, editarlo fuera o moverlo de cuenta. */}
                              {sk.files?.length > 0 && (
                                // El ZIP se arma en el SERVIDOR: el bucket público no
                                // manda cabeceras CORS, así que bajarlo desde aquí fallaba
                                // en silencio y no descargaba nada.
                                <a href={`/dash/flota/skill/${sel.id}/${sk.id}`} title="Descargar este skill"
                                  className="shrink-0 p-1.5 rounded-lg border-2 border-gray-200 text-marengo hover:border-black hover:text-onix transition-colors">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                  </svg>
                                </a>
                              )}
                              <button type="button" title="Borrar este skill" onClick={() => setKillSkill(sk.id)}
                                className="shrink-0 p-1.5 rounded-lg border-2 border-gray-200 text-marengo hover:border-brand-red hover:text-brand-red transition-colors">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                </svg>
                              </button>
                              {/* Prestar el skill a otro agente: son los MISMOS archivos
                                  (no se re-suben), así que copiarlo es instantáneo. */}
                              {pools.length > 1 && (
                                // El <select> nativo se recortaba a "copiar a..": necesita
                                // ancho propio y no encogerse. Es un menú de acción, no una
                                // etiqueta, así que se ve como control.
                                <select defaultValue="" title="Copiar este skill a otro agente"
                                  onChange={(e) => { const t = e.target.value; e.target.value = "";
                                    if (t) submit({ intent: "copy-skill", skillId: sk.id, targetId: t }); }}
                                  className="shrink-0 w-36 border-2 border-gray-200 rounded-lg pl-2.5 pr-1 py-1.5 text-xs font-semibold bg-white cursor-pointer hover:border-black focus:border-black focus:outline-none">
                                  <option value="">Copiar a…</option>
                                  {pools.filter((o: any) => o.id !== sel.id).map((o: any) => (
                                    <option key={o.id} value={o.id}>{o.name || "sin nombre"}</option>
                                  ))}
                                </select>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Ensayo ─────────────────────────────────────────────────── */}
          <div className="hidden xl:block xl:sticky xl:top-6 min-w-0">
            <Card title="Ensayo"
              right={
                <div className="flex items-center gap-2">
                  <Expand onClick={() => setBig("ensayo")} label="Ensayar en grande" />
                </div>
              }>
              <EnsayoBody msgs={ensayo.msgs} busy={ensayo.busy} loading={ensayo.loading} onSend={ensayo.send} />
              <p className="text-[11px] text-tale mt-2 leading-relaxed">
                Aquí el agente <b>puede cambiarse a sí mismo</b>: decirle “de ahora en
                adelante…” reescribe sus instrucciones de verdad.{" "}
                <button onClick={() => revalidator.revalidate()} className="font-bold underline">Recargar</button> para verlas arriba.
              </p>
            </Card>
          </div>
        </div>

      <AnimatePresence>
        {/* Borrar es irreversible y se lleva trabajo de meses: se confirma diciendo
            QUÉ se pierde, con la copia a mano, y escribiendo el nombre. Nada de
            confirm() del navegador. */}
        {inbox && (
          <FullScreen title={`Conversaciones · ${inbox.subject}`} onClose={() => setInbox(null)}>
            <div className="overflow-y-auto eb-thin flex-1 min-h-0">
              <WabaInbox agent={{ id: sel.id }} number={inbox} />
            </div>
          </FullScreen>
        )}
        {killAgent && (
          <FullScreen title="Borrar agente" size="auto" onClose={() => { setKillAgent(false); setKillName(""); }}>
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Vas a borrar <b>{sel.name || "este agente"}</b>. Se van con él sus instrucciones,
                sus skills, sus capacidades y la vinculación de sus canales: los grupos que
                atiende se quedan sin quien conteste.
              </p>
              <p className="text-xs text-marengo">
                {sel.conversations} conversación{sel.conversations !== 1 ? "es" : ""} y{" "}
                {sel.vms} caja{sel.vms !== 1 ? "s" : ""} encendida{sel.vms !== 1 ? "s" : ""}.
                Tus archivos y tus secretos NO se borran. No hay deshacer.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Escribe <b>{sel.name}</b> para confirmar</span>
                <input value={killName} onChange={(e) => setKillName(e.target.value)} autoFocus
                  className="border-2 border-black rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setKillAgent(false); setKillName(""); }}
                  className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-white">Cancelar</button>
                <button type="button" disabled={killName.trim() !== (sel.name ?? "").trim()}
                  onClick={() => { submit({ intent: "delete" }); setKillAgent(false); setKillName(""); setSelIdState(null); }}
                  className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-red text-white disabled:opacity-40">
                  Borrar definitivamente
                </button>
              </div>
            </div>
          </FullScreen>
        )}
        {killSkill && (() => {
          const sk = (sel.skills ?? []).find((x: any) => x.id === killSkill);
          if (!sk) return null;
          return (
            <FullScreen title="Borrar skill" size="auto" onClose={() => setKillSkill(null)}>
              <div className="flex flex-col gap-4">
                <p className="text-sm">
                  Vas a quitarle <b>“{sk.name}”</b> a {sel.name}. Desde el siguiente turno deja de
                  saber hacerlo: si traía reglas de negocio (precios, descuentos, formatos),
                  volverá a improvisarlas.
                </p>
                <p className="text-xs text-marengo">
                  Sus {sk.files?.length ?? 0} archivo{sk.files?.length !== 1 ? "s" : ""} NO se borran —
                  quedan en Archivos. Si otro agente tiene una copia, la suya sigue intacta.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href={`/dash/flota/skill/${sel.id}/${sk.id}`}
                    className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-white">Descargar copia</a>
                  <button type="button" onClick={() => setKillSkill(null)}
                    className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-white">Cancelar</button>
                  <button type="button"
                    onClick={() => { submit({ intent: "delete-skill", skillId: sk.id }); setKillSkill(null); }}
                    className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-red text-white">
                    Sí, borrar “{sk.name}”
                  </button>
                </div>
              </div>
            </FullScreen>
          );
        })()}
        {big === "prompt" && (
          <FullScreen title={`Instrucciones · ${sel.name ?? ""}`} onClose={() => setBig(null)}>
            <fetcher.Form method="post" action="/dash/flota" className="flex flex-col flex-1 min-h-0"
              onSubmit={() => { setDirty(false); setBig(null); }}>
              <input type="hidden" name="intent" value="set-agent-prompt" />
              <input type="hidden" name="fleetAgentId" value={sel.id} />
              {promptEditor}
              <div className="flex justify-end gap-2 mt-3 shrink-0">
                <button type="button" onClick={() => setBig(null)} className="border-2 border-black rounded-xl px-4 py-1.5 text-sm font-bold bg-white">Cerrar</button>
                <button type="submit" className="border-2 border-black rounded-xl px-4 py-1.5 text-sm font-bold bg-brand-500 text-white">Guardar</button>
              </div>
            </fetcher.Form>
          </FullScreen>
        )}
        {creating && (() => {
          const eng = FLEET_ENGINES.find((e) => e.id === engineId) ?? FLEET_ENGINES[0];
          // "Si la llave no está, que te la pida": el campo del secreto sólo aparece
          // cuando el motor lo exige y el vault no lo tiene.
          const needsSecret = !!eng.secret && engineHasSecret?.[eng.id] === false;
          return (
            <FullScreen title="Nuevo agente" size="auto" onClose={() => setCreating(false)}>
              <fetcher.Form method="post" action="/dash/flota" className="flex flex-col gap-4"
                onSubmit={() => setCreating(false)}>
                <input type="hidden" name="intent" value="create" />
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold">¿Cómo se llama?</span>
                  <input name="name" autoFocus placeholder="Pia, Nik, tania…"
                    className="border-2 border-black rounded-xl px-3 py-2 text-sm focus:outline-none" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold">Motor</span>
                  <select name="engine" value={engineId} onChange={(e) => setEngineId(e.target.value)}
                    className="border-2 border-black rounded-xl px-3 py-2 text-sm bg-white">
                    {FLEET_ENGINES.map((e) => (
                      <option key={e.id} value={e.id} disabled={!engineCreatable(e)}>
                        {e.label}{!engineCreatable(e) ? " · próximamente" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {eng.models.length > 1 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">Modelo</span>
                    <select name="model" defaultValue={eng.defaultModel}
                      className="border-2 border-black rounded-xl px-3 py-2 text-sm bg-white">
                      {eng.models.map((m) => (
                        <option key={m.id} value={m.id} disabled={m.ready === false}>
                          {m.label}{m.ready === false ? " · próximamente" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {needsSecret && eng.secret && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">{eng.secret.name}</span>
                    <input name="secretValue" type="password" autoComplete="off" required
                      placeholder={eng.secret.placeholder ?? "pega aquí la credencial"}
                      className="border-2 border-black rounded-xl px-3 py-2 text-sm font-mono focus:outline-none" />
                    <span className="text-[11px] text-tale">Se guarda cifrada en tu bóveda; sirve para todos tus agentes de este motor.</span>
                  </label>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-500 text-white">
                    Crear agente
                  </button>
                  <button type="button" onClick={() => setCreating(false)}
                    className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-white">
                    Cancelar
                  </button>
                </div>
              </fetcher.Form>
            </FullScreen>
          );
        })()}
        {capInfo && (
          <FullScreen title={capInfo.label ?? capInfo.name} size="auto" onClose={() => setCapInfo(null)}>
            <div className="flex flex-col gap-4 overflow-y-auto eb-thin">
              {capInfo.description && <p className="text-sm text-marengo">{capInfo.description}</p>}
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-bold text-tale">Estado</dt>
                  <dd>
                    {capInfo.builtin
                      ? "Siempre activa. Viene con el agente y no se apaga."
                      : (sel.defaultMcps ?? []).includes(capInfo.name)
                        ? "Encendida para todos sus canales."
                        : "Apagada."}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-tale">Nombre técnico</dt>
                  <dd className="font-mono text-xs">{capInfo.name}</dd>
                </div>
                {capInfo.requiredSecrets?.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-tale">Credenciales que necesita</dt>
                    <dd className="flex flex-wrap gap-2 mt-1">
                      {capInfo.requiredSecrets.map((n: string) => (
                        <span key={n} className={`font-mono text-[11px] px-2 py-0.5 rounded-full border-2 ${capInfo.missingSecrets?.includes(n) ? "border-brand-red text-brand-red" : "border-emerald"}`}>
                          {n} {capInfo.missingSecrets?.includes(n) ? "· falta" : "· lista"}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {capInfo.levels?.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-tale">Niveles de acceso</dt>
                    <dd>{capInfo.levels.map((l: any) => l.label).join(" · ")}</dd>
                  </div>
                )}
              </dl>
              {!capInfo.builtin && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!capInfo.secretsPresent}
                    onClick={() => { const on = (sel.defaultMcps ?? []).includes(capInfo.name);
                      submit({ intent: "toggle-group-mcp", groupId: "*", mcp: capInfo.name, on: on ? "0" : "1" }); setCapInfo(null); }}
                    className="border-2 border-black rounded-xl px-4 py-1.5 text-sm font-bold bg-brand-500 text-white disabled:opacity-40">
                    {(sel.defaultMcps ?? []).includes(capInfo.name) ? "Apagar" : "Encender"}
                  </button>
                  {capInfo.custom && (
                    <button type="button" onClick={() => { submit({ intent: "remove-mcp", name: capInfo.name }); setCapInfo(null); }}
                      className="border-2 border-black rounded-xl px-4 py-1.5 text-sm font-bold bg-white">
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
          </FullScreen>
        )}
        {big === "ensayo" && (
          <FullScreen title={`Ensayo · ${sel.name ?? ""}`} onClose={() => setBig(null)}>
            <EnsayoBody msgs={ensayo.msgs} busy={ensayo.busy} loading={ensayo.loading} onSend={ensayo.send} tall />
          </FullScreen>
        )}
      </AnimatePresence>
      {/* Tablet y abajo: el ensayo no cabe al lado, así que vive en un panel. */}
      <button type="button" onClick={() => setBig("ensayo")}
        className="xl:hidden fixed left-4 md:left-24 bottom-4 z-30 flex items-center gap-2 border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-brand-500 text-white shadow-[2px_2px_0_0_#000]">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Ensayo
      </button>
      <ScrollJumps />
    </div>
  );
}
