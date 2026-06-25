import type { Route } from "./+types/pools";
import { useEffect, useState } from "react";
import { useFetcher, useRevalidator, data } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import QRCode from "qrcode";
import { Switch } from "~/components/forms/Switch";
import { PLANS, getUserPlan, NEXT_PLAN } from "~/lib/plans";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { delegatedAccountIds, SCOPES } from "~/.server/delegation";
import { createPool, deletePool } from "~/.server/core/poolOperations";
import { getReservedCapacity } from "~/.server/core/sandboxReservations";
import { listSecrets, createSecret } from "~/.server/core/secretOperations";
import {
  connectPool,
  disconnectPool,
  listPoolGroups,
  isPoolLive,
  ensureRehydrated,
} from "~/.server/integrations/whatsapp/baileys.server";

const DEFAULT_OAUTH = "CLAUDE_CODE_OAUTH_TOKEN";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  // Reconnect any pools that were live before an app restart (lazy, once).
  await ensureRehydrated();

  const secretNames = (await listSecrets(user.id)).map((s) => s.name);
  const rows = await db.pool.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } });
  const pools = await Promise.all(
    rows.map(async (p) => {
      const b = (p.baileys ?? {}) as { status?: string; qr?: string };
      const status = b.status ?? "disconnected";
      const live = isPoolLive(p.id);
      // Show QR / pairing code by PRESENCE (they persist across transient status
      // changes via the merge in setStatus) — hide only once actually connected.
      const connectedNow = status === "connected";
      const qrDataUrl =
        !connectedNow && b.qr ? await QRCode.toDataURL(b.qr).catch(() => null) : null;
      const pairingCode = !connectedNow ? ((b as any).pairingCode as string | undefined) ?? null : null;
      // Merged list (live groupFetch ∪ discovered seenGroups) — shows groups with
      // activity even if metadata sync hasn't listed them yet.
      const groups = await listPoolGroups(p.id);
      // Per-VM capacity boxes: each worker VM + how many conversations (slots) it
      // holds vs maxWorkersPerVm. Drives the "cajitas encendidas" capacity view.
      const workers = await db.agent.findMany({
        where: { poolId: p.id, status: { in: ["running", "suspended", "building"] } },
        select: { id: true, status: true, sandboxId: true },
      });
      // Ghosty = cerebro claude-worker → en las cajitas los agentes se dibujan
      // como fantasmitas; cualquier otro template usa los ojitos genéricos.
      const ghosty = p.workerTemplate === "claude-worker";
      const machines = await Promise.all(
        workers.map(async (w) => ({
          id: w.id,
          sandboxId: w.sandboxId,
          status: w.status,
          ghosty,
          slots: await db.poolRoute.count({ where: { agentId: w.id } }),
        }))
      );
      const conversations = await db.poolRoute.count({ where: { poolId: p.id } });
      return {
        id: p.id, name: p.name, status, live, qrDataUrl, pairingCode, groups,
        enabledCount: p.enabledGroups.length, machines, vms: machines.length,
        conversations, maxWorkersPerVm: p.maxWorkersPerVm, vmMemMb: p.vmMemMb,
      };
    })
  );
  // Capacity is per ACCOUNT (one fleet, any number of channels) — aggregate every
  // channel's worker VMs into a single general view instead of per-card cajitas.
  const machines = pools.flatMap((p) => p.machines);
  // Account capacity = the plan's concurrent-sandbox budget. A pool worker VM IS
  // a sandbox, so "Mega = 3 máquinas" maps 1:1. Each VM holds maxWorkersPerVm
  // agents (workers), so agent capacity = maxMachines × maxWorkersPerVm.
  const plan = getUserPlan(user);
  const planCfg = PLANS[plan];
  const maxWorkersPerVm = pools[0]?.maxWorkersPerVm ?? 2;
  // Reserved capacity bought in /dash/packs raises the budget on top of the
  // plan: +1 machine slot and +`agents` agent slots per active reservation.
  const reserved = await getReservedCapacity(user.id);
  // TODAS las sandboxes del owner en el host se muestran en el HUD, categorizadas:
  // las de SISTEMA (llamadas livekit / voz kokoro) en azul, y cualquier otra
  // (custom: code-interpreter, etc.) en gris con su template. Dedup contra los
  // worker del pool (ya están en `machines`). Consistente con el gate de budget.
  const { listSandboxes } = await import("~/.server/core/sandboxOperations");
  const SYSTEM_TEMPLATES: Record<string, string> = { "livekit-svc": "llamadas" };
  const workerSandboxIds = new Set(machines.map((m) => m.sandboxId).filter(Boolean) as string[]);
  const hostVms = await listSandboxes({ user, scopes: ["READ"] } as any).catch(() => [] as any[]);
  const extraMachines = (hostVms as any[])
    .filter((v) => !workerSandboxIds.has(v.sandboxId) && (v.status === "running" || v.status === "starting"))
    .map((v) =>
      SYSTEM_TEMPLATES[v.template]
        ? { id: v.sandboxId, status: v.status as string, kind: "system" as const, label: SYSTEM_TEMPLATES[v.template] }
        : { id: v.sandboxId, status: v.status as string, kind: "custom" as const, label: v.template as string }
    );
  const capacity = {
    machines,
    extraMachines,
    vms: machines.length + extraMachines.length,
    maxMachines: planCfg.concurrentSandboxes + reserved.machines,
    plan,
    planName: planCfg.name,
    nextPlan: NEXT_PLAN[plan] ?? null,
    maxWorkersPerVm,
    vmMemMb: pools[0]?.vmMemMb ?? 512,
    // vCPU por sandbox — misma regla que spawnVm (≤512MB → 1, si no 2).
    vcpus: (pools[0]?.vmMemMb ?? 512) <= 512 ? 1 : 2,
    reservedMachines: reserved.machines,
    // Agents running RIGHT NOW = sum of workers inside active VMs (coherent with
    // "VMs contain agents"); idle/detached routes don't count until re-spawned.
    agentsActive: machines.reduce((s, m) => s + m.slots, 0),
    // LINEAL y uniforme: cada sandbox DISPONIBLE PARA AGENTES corre maxWorkersPerVm.
    // Los sandboxes ocupados por sistema (llamadas/voz) o custom NO están libres
    // para agentes → se descuentan del budget. Ej: 5 sandboxes − 3 llamadas = 2
    // libres × 4 = 8 agentes máx. agentsMax = total sandboxes × agentes-por-sandbox. Sin densidades
    // mixtas por tier — un add-on = +1 sandbox del MISMO tamaño.
    agentsMax: Math.max(0, planCfg.concurrentSandboxes + reserved.machines - extraMachines.length) * maxWorkersPerVm,
  };
  // Flotas compartidas conmigo (delegación scope `agents`) — lista read-only,
  // separada del HUD de capacidad (que es por cuenta propia). Sólo visibilidad.
  const delegatedIds = await delegatedAccountIds(
    { user, scopes: ["READ"] } as any,
    SCOPES.AGENTS
  );
  let sharedPools: Array<{ id: string; name: string | null; status: string; ownerEmail: string | null }> = [];
  if (delegatedIds.length) {
    const [sharedRows, owners] = await Promise.all([
      db.pool.findMany({ where: { ownerId: { in: delegatedIds } }, orderBy: { createdAt: "desc" } }),
      db.user.findMany({ where: { id: { in: delegatedIds } }, select: { id: true, email: true } }),
    ]);
    const emailById = new Map(owners.map((u) => [u.id, u.email]));
    sharedPools = sharedRows.map((p) => ({
      id: p.id,
      name: p.name,
      status: ((p.baileys ?? {}) as { status?: string }).status ?? "disconnected",
      ownerEmail: emailById.get(p.ownerId) ?? null,
    }));
  }
  return { secretNames, pools, capacity, sharedPools };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN" as const] };
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  if (intent === "create") {
    const name = String(fd.get("name") || "").trim() || undefined;
    let oauthSecretName = String(fd.get("oauthSecretName") || "").trim();
    const newOauth = String(fd.get("newOauth") || "").trim();
    // Pasting a new token saves it to the vault under the given (or default) name.
    if (newOauth) {
      const secretName = String(fd.get("newOauthName") || "").trim() || DEFAULT_OAUTH;
      await createSecret(user.id, { name: secretName, value: newOauth });
      oauthSecretName = secretName;
    }
    if (!oauthSecretName) return data({ error: "Elige o pega un OAuth" }, { status: 400 });
    const pool = await createPool(ctx, { name, oauthSecretName });
    return data({ ok: true, poolId: pool.id });
  }

  const poolId = String(fd.get("poolId") || "");
  const pool = poolId ? await db.pool.findUnique({ where: { id: poolId } }) : null;
  if (!pool || pool.ownerId !== user.id) return data({ error: "not found" }, { status: 404 });

  if (intent === "connect") {
    // Non-blocking: flip status to "connecting" so the UI starts polling, then
    // fire connectPool in the background. Awaiting it could hang the action on
    // the WhatsApp version fetch / socket setup → spinner stuck forever.
    const phone = String(fd.get("phone") || "").trim() || undefined; // pairing-code method if set
    await db.pool.update({ where: { id: poolId }, data: { baileys: { status: "connecting", at: new Date().toISOString() } } });
    void connectPool(poolId, { pairingPhone: phone }).catch((e) => console.error("connectPool failed", e));
    return data({ ok: true });
  }
  if (intent === "disconnect") {
    await disconnectPool(poolId);
    return data({ ok: true });
  }
  if (intent === "delete") {
    await disconnectPool(poolId).catch(() => {});
    await deletePool(ctx, poolId);
    return data({ ok: true, deleted: true });
  }
  if (intent === "rename") {
    const name = String(fd.get("name") || "").trim();
    await db.pool.update({ where: { id: poolId }, data: { name: name || null } });
    return data({ ok: true });
  }
  if (intent === "toggle-group") {
    const groupId = String(fd.get("groupId") || "");
    const on = String(fd.get("on") || "") === "1";
    const set = new Set(pool.enabledGroups);
    if (on) set.add(groupId);
    else set.delete(groupId);
    await db.pool.update({ where: { id: poolId }, data: { enabledGroups: [...set] } });
    return data({ ok: true });
  }
  return data({ error: "intent inválido" }, { status: 400 });
}

const STATUS = {
  connected: { label: "Conectado", dot: "bg-green-500" },
  qr_pending: { label: "Escanea el QR", dot: "bg-yellow-500" },
  pairing: { label: "Teclea el código", dot: "bg-yellow-500" },
  connecting: { label: "Conectando…", dot: "bg-yellow-500 animate-pulse" },
  failed: { label: "Falló", dot: "bg-red-500" },
  disconnected: { label: "Desconectado", dot: "bg-gray-300" },
} as const;

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]" />;
}

type Capacity = {
  machines: { id: string; status: string; slots: number; ghosty?: boolean }[];
  extraMachines: { id: string; status: string; kind: "system" | "custom"; label: string }[];
  vms: number; maxMachines: number; plan: string; planName: string;
  nextPlan: string | null; maxWorkersPerVm: number; vmMemMb: number; vcpus: number;
  reservedMachines: number; agentsActive: number; agentsMax: number;
};

const SPAWN = { initial: { scale: 0.4, opacity: 0, y: 8 }, animate: { scale: 1, opacity: 1, y: 0 }, exit: { scale: 0.4, opacity: 0, y: 8 } };

// Ghosty — la mascota de la marca (fantasma morado + lentes), el agente INSIGNIA
// que el pool ofrece por default. Inline SVG (no hay asset suelto del fantasma;
// /logo-purple.svg es solo los ojitos). Parpadea sutil para sentirse vivo.
function GhostyMascot({ className = "", blink = true, sleeping = false }: { className?: string; blink?: boolean; sleeping?: boolean }) {
  const Blink = blink && !sleeping ? (
    <animate attributeName="ry" values="11;11;1.5;1.5;11;11" dur="5s" repeatCount="indefinite" keyTimes="0;0.88;0.91;0.965;0.99;1" />
  ) : null;
  return (
    <svg viewBox="0 0 84 96" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* cuerpo */}
      <path d="M11 80 L11 41 C11 21 23 5 42 5 C61 5 73 21 73 41 L73 80 Q65.25 88 57.5 80 Q49.75 88 42 80 Q34.25 88 26.5 80 Q18.75 88 11 80 Z" fill="#9870ED" />
      {/* blush */}
      <ellipse cx="23" cy="50" rx="5" ry="3" fill="#B79BF2" />
      <ellipse cx="61" cy="50" rx="5" ry="3" fill="#B79BF2" />
      {/* patas de los lentes */}
      <path d="M16 37 L4 33" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" />
      <path d="M68 37 L80 33" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" />
      {/* puente */}
      <path d="M37 36 Q42 32 47 36" stroke="#EAE7F4" strokeWidth="4" strokeLinecap="round" fill="none" />
      {sleeping ? (
        <>
          {/* dormido — ojitos cerrados (arcos hacia abajo) */}
          <path d="M22 41 Q29 47 36 41" stroke="#1C1726" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M48 41 Q55 47 62 41" stroke="#1C1726" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          {/* lentes oscuros (ojitos despiertos) */}
          <ellipse cx="29" cy="41" rx="8" ry="11" fill="#1C1726">{Blink}</ellipse>
          <ellipse cx="55" cy="41" rx="8" ry="11" fill="#1C1726">{Blink}</ellipse>
        </>
      )}
      {/* marcos */}
      <circle cx="29" cy="40" r="13.5" stroke="#EAE7F4" strokeWidth="4" />
      <circle cx="55" cy="40" r="13.5" stroke="#EAE7F4" strokeWidth="4" />
    </svg>
  );
}

// One sandbox = a CONTAINER box; the agents (workers) inside it are the ojitos.
// Color climbs with occupancy: empty→gray, healthy→green, full→amber (no room);
// building pulses violet; an unspawned slot is a dashed "mount" ready on demand.
function VmBox({ id, status, slots, max, ghosty, addon, kind, sysLabel }: { id: string; status: string | null; slots: number; max: number; ghosty?: boolean; addon?: boolean; kind?: "system" | "custom"; sysLabel?: string }) {
  const system = kind === "system";
  const custom = kind === "custom";
  const extra = system || custom;
  const full = slots >= max;
  const frame =
    system ? "border-blue-500 bg-blue-50"
    : custom ? "border-slate-400 bg-slate-50"
    : status === "building" ? "border-violet-500 bg-violet-50 animate-pulse"
    : status == null ? (addon ? "border-brand-500 border-dashed bg-brand-500/5" : "border-gray-200 border-dashed bg-gray-50/40")
    // Dormida (suspended): congelada, ~0 CPU/RAM, resume <1s. Se pinta atenuada
    // para que NO se lea como "ocupada gastando" — es capacidad casi-libre.
    : status === "suspended" ? "border-indigo-200 bg-indigo-50/50"
    : full ? "border-amber-500 bg-amber-50"
    : slots > 0 ? "border-green-500 bg-green-50"
    : "border-gray-300 bg-gray-50";
  const label = extra ? (sysLabel ?? (system ? "llamadas" : "sandbox")) : status == null ? (addon ? "add-on" : "libre") : status === "building" ? "booteando" : `${slots}/${max} agentes`;
  // motion SOLO para entrada/salida (aparecer/desaparecer). SIN `layout` y el
  // AnimatePresence va SIN popLayout → no hay jitter en cada poll, solo se anima
  // cuando una caja realmente nace o muere.
  return (
    <motion.div
      {...SPAWN}
      whileHover={{ scale: 1.04, y: -2 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      title={extra ? `Sandbox de ${system ? "llamadas/voz" : "sistema"} — no atiende agentes` : status == null ? "Sandbox disponible — se levanta bajo demanda" : status === "suspended" ? `Dormida — congelada, 0 CPU/RAM, resume en <1s. Solo ocupa disco; se destruye a los 45 min sin actividad. ${slots}/${max} conversaciones en memoria` : `Sandbox ${status} · ${slots}/${max} agentes`}
      className={`w-full aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-3 cursor-default hover:shadow-[3px_3px_0_rgba(0,0,0,0.15)] ${frame}`}
    >
      {system ? (
        <svg className="w-12 h-12 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ) : custom ? (
        <svg className="w-12 h-12 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
        </svg>
      ) : (
        <div className="relative grid grid-cols-2 gap-2.5 place-items-center">
          {status === "suspended" && slots > 0 && (
            <span className="pointer-events-none absolute -top-3 -right-2 font-jersey text-sm leading-none text-indigo-400 select-none -rotate-6">Zzz</span>
          )}
          {Array.from({ length: max }).map((_, j) =>
            j < slots ? (
              <div key={`a${j}`} className={`w-10 h-10 flex items-center justify-center ${status === "suspended" ? "opacity-50" : ""}`}>
                {ghosty ? <GhostyMascot className="w-8 h-10" sleeping={status === "suspended"} /> : <img src="/logo-purple.svg" alt="" className={`w-10 h-10 ${status === "suspended" ? "grayscale" : ""}`} />}
              </div>
            ) : (
              <span key={`e${j}`} className="w-6 h-6 rounded-md border-2 border-gray-300 bg-white/70" />
            )
          )}
        </div>
      )}
      <span className={`font-jersey text-base leading-none truncate max-w-full px-2 ${system ? "text-blue-600 font-bold" : custom ? "text-slate-600 font-bold" : addon && status == null ? "text-brand-500 font-bold" : "text-gray-500"}`}>{label}</span>
    </motion.div>
  );
}

function CapacityHud({ capacity }: { capacity: Capacity }) {
  const usedSlots = capacity.machines.length + capacity.extraMachines.length;
  const freeSlots = Math.max(0, capacity.maxMachines - usedSlots);
  return (
    <div className="border-2 border-black rounded-xl p-4 lg:col-span-2 animate-fade-in bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-jersey text-3xl leading-none tracking-wide">CAPACIDAD</span>
          <motion.span whileHover={{ scale: 1.08, rotate: -2 }}
            className="font-jersey text-lg leading-none px-2 py-1 bg-brand-500 text-white border-2 border-black rounded-md cursor-default">
            {capacity.planName.toUpperCase()}
          </motion.span>
        </div>
        <span className="font-jersey text-xl leading-none text-gray-500">
          <span className="text-black">{capacity.agentsActive}/{capacity.agentsMax} AGENTES</span> · {capacity.vms}/{capacity.maxMachines} sandboxes
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AnimatePresence>
          {/* Las últimas `reservedMachines` cajitas (de maxMachines) son add-ons
              comprados — se marcan en morado para que el cliente VEA lo que paga. */}
          {capacity.machines.map((m, i) => (
            <VmBox key={m.id} id={m.id} status={m.status} slots={m.slots} max={capacity.maxWorkersPerVm} ghosty={m.ghosty}
              addon={i >= capacity.maxMachines - capacity.reservedMachines} />
          ))}
          {/* Sandboxes extra del host: sistema (llamadas/voz, azul) y custom (gris) */}
          {capacity.extraMachines.map((s) => (
            <VmBox key={s.id} id={s.id} status={s.status} slots={0} max={capacity.maxWorkersPerVm} kind={s.kind} sysLabel={s.label} />
          ))}
          {Array.from({ length: freeSlots }).map((_, i) => (
            <VmBox key={`free-${i}`} id={`free-${i}`} status={null} slots={0} max={capacity.maxWorkersPerVm}
              addon={capacity.machines.length + capacity.extraMachines.length + i >= capacity.maxMachines - capacity.reservedMachines} />
          ))}
          {/* Añadir capacidad — sube de plan para más sandboxes */}
          <motion.a key="add" href="/dash/packs?tab=sandboxes" title="Añadir capacidad"
            whileHover={{ scale: 1.08, rotate: 2 }} whileTap={{ scale: 0.95 }}
            className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-300 text-gray-400 flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-brand-500 hover:text-brand-500 hover:bg-brand-500/5">
            <span className="text-2xl leading-none">+</span>
            <span className="font-jersey text-[12px] leading-none">MÁS</span>
          </motion.a>
        </AnimatePresence>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        {capacity.maxMachines} sandbox{capacity.maxMachines !== 1 ? "es" : ""}
        {capacity.reservedMachines > 0
          ? ` (${capacity.maxMachines - capacity.reservedMachines} ${capacity.planName} + ${capacity.reservedMachines} add-on${capacity.reservedMachines !== 1 ? "s" : ""})`
          : ` · plan ${capacity.planName}`}
        {` · ${(capacity.vmMemMb / 1024).toFixed(capacity.vmMemMb % 1024 ? 1 : 0)}GB · ${capacity.vcpus} vCPU · ${capacity.maxWorkersPerVm} agentes c/u. `}
        {capacity.nextPlan
          ? <a href="/planes" className="font-semibold text-brand-500 hover:underline">Sube a {capacity.nextPlan} ↗</a>
          : <a href="/dash/packs?tab=sandboxes" className="font-semibold text-brand-500 hover:underline">Añade capacidad ↗</a>}
      </p>
    </div>
  );
}

export default function Pools({ loaderData }: Route.ComponentProps) {
  const { secretNames, pools, capacity, sharedPools } = loaderData;
  const fetcher = useFetcher();
  const rev = useRevalidator();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [oauthChoice, setOauthChoice] = useState(secretNames.includes(DEFAULT_OAUTH) ? DEFAULT_OAUTH : secretNames[0] ?? "__new__");
  const [newOauth, setNewOauth] = useState("");
  const hasSecrets = secretNames.length > 0;
  const pasteNew = oauthChoice === "__new__" || !hasSecrets;

  const busy = fetcher.state !== "idle";
  const bIntent = fetcher.formData?.get("intent") as string | undefined;
  const bPool = fetcher.formData?.get("poolId") as string | undefined;
  const isBusy = (intent: string, poolId?: string) => busy && bIntent === intent && (poolId === undefined || bPool === poolId);

  const polling = pools.some(
    (p) =>
      p.status === "qr_pending" || p.status === "pairing" || p.status === "connecting" ||
      p.status === "connected" || // live: ver VMs aparecer/apagarse sin refrescar
      (p.machines?.length ?? 0) > 0
  );
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [showAllGroups, setShowAllGroups] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [optimisticNames, setOptimisticNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => rev.revalidate(), 2500);
    return () => clearInterval(t);
  }, [polling, rev]);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-bold">Tu flota de agentes</h1>
        <span className="group relative inline-flex">
          <button type="button" aria-label="¿Qué es la flota?"
            className="w-5 h-5 rounded-full border-2 border-black text-xs font-bold flex items-center justify-center text-gray-600 hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            ?
          </button>
          <span className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto absolute left-0 top-7 z-10 w-64 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity border-2 border-black rounded-xl bg-white p-3 text-sm text-gray-600 shadow-[2px_2px_0_0_#000]">
            Agentes Ghosty que atienden tus grupos de WhatsApp. Conecta por QR y elige los grupos.{" "}
            <a href="/docs#flota" target="_blank" rel="noopener noreferrer" className="text-brand-500 font-semibold underline">Ver documentación →</a>
          </span>
        </span>
      </div>
      <p className="text-gray-500 mb-6">Crea un agente, conéctalo a WhatsApp y atiende tus grupos. Se levanta bajo demanda.</p>

      {/* Bento responsive: Capacidad a todo lo ancho arriba; luego Nuevo agente y
          los agentes fluyen en 2 columnas (desktop) y se apilan en mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

      {/* Capacidad — HUD estilo videojuego. Las VMs son CONTENEDORES; dentro
          viven los agentes (workers, render = ojitos de la marca). El color de
          cada VM sube según ocupación: gris (vacía) → morado (a medias) → verde
          (llena), amarillo si está booteando. Capacidad = plan de la cuenta. */}
      <CapacityHud capacity={capacity} />

      {/* Nuevo agente — colapsada: solo Ghosty + descripción + botón sutil. El form
          se abre bajo demanda (lo trabajamos a fondo después). */}
      <div className="border-2 border-black rounded-xl p-4 animate-fade-in bg-white">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-16 h-16 rounded-xl bg-brand-500/10 border-2 border-black flex items-center justify-center">
            <GhostyMascot className="w-10 h-12" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg leading-none">Ghosty</span>
              <a href="https://formmy.app/ghosty" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full hover:bg-brand-500/20 transition-colors whitespace-nowrap">
                Powered by Formmy ↗
              </a>
            </div>
            <p className="text-xs text-gray-500 leading-snug mt-1">Tu agente de WhatsApp. Atiende grupos, crea documentos y sube archivos — se levanta bajo demanda.</p>
          </div>
          {!showForm && (
            <button type="button" onClick={() => setShowForm(true)}
              className="shrink-0 text-sm font-semibold text-brand-500 border-2 border-brand-500/30 rounded-lg px-3 py-2 hover:bg-brand-500/5 transition-colors">
              + Crear
            </button>
          )}
        </div>
        {!showForm ? null : (
        <fetcher.Form method="post" className="flex flex-col gap-3 mt-4">
          <input type="hidden" name="intent" value="create" />
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atención a cliente"
            className="border-2 border-black rounded-lg px-3 py-2" />

          <label className="text-sm font-semibold">OAuth de Claude (cuenta Max)</label>
          {hasSecrets && (
            <select name="oauthSecretName" value={oauthChoice} onChange={(e) => setOauthChoice(e.target.value)}
              className="border-2 border-black rounded-lg px-3 py-2 bg-white">
              {secretNames.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__new__">➕ Pegar nuevo…</option>
            </select>
          )}
          {pasteNew && (
            <div className="flex flex-col gap-2">
              <input name="newOauth" value={newOauth} onChange={(e) => setNewOauth(e.target.value)} type="password"
                placeholder="sk-ant-oat..." className="border-2 border-black rounded-lg px-3 py-2 font-mono text-sm" />
              <input name="newOauthName" defaultValue={DEFAULT_OAUTH}
                className="border-2 border-black rounded-lg px-3 py-2 font-mono text-xs text-gray-500"
                title="Nombre del secreto en el vault" />
              <span className="text-xs text-gray-400">Se guarda cifrado en Secretos.</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button disabled={isBusy("create")} className="self-start bg-brand-500 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-60">
              {isBusy("create") ? <Spinner /> : "+ Crear Agente"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        </fetcher.Form>
        )}
      </div>

      {pools.length === 0 && <p className="lg:col-span-2 text-gray-400">Aún no tienes agentes.</p>}
        {pools.map((p) => {
          const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
          const stale = p.status === "connected" && !p.live;
          // Forzar abierto durante flujos de conexión (QR/pairing) para no esconder el código.
          const inFlow = p.status === "connecting" || p.status === "qr_pending" || p.status === "pairing" || !!p.qrDataUrl || !!p.pairingCode;
          const isOpen = (expanded[p.id] ?? false) || inFlow;
          // Optimistic name: muestra el valor recién escrito hasta que el loader se ponga al día.
          const displayName = (optimisticNames[p.id] ?? p.name) || "";
          return (
            <div key={p.id} className="border-2 border-black rounded-xl p-4 animate-fade-in">
              <div className="w-full flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button type="button" onClick={() => !inFlow && setExpanded((s) => ({ ...s, [p.id]: !isOpen }))}
                    className={`shrink-0 ${inFlow ? "cursor-default" : ""}`} aria-label={isOpen ? "Contraer" : "Expandir"}>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""} ${inFlow ? "opacity-0" : ""}`}
                      viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" /></svg>
                  </button>
                  {editingName === p.id ? (
                    <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => { const v = draftName.trim(); if (v !== displayName) { setOptimisticNames((s) => ({ ...s, [p.id]: v })); fetcher.submit({ intent: "rename", poolId: p.id, name: v }, { method: "post" }); } setEditingName(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(null); }}
                      placeholder="Sin nombre"
                      className="font-bold border-b-2 border-brand-500 bg-transparent outline-none min-w-0 flex-1 px-0.5" />
                  ) : (
                    <button type="button" title="Clic para renombrar"
                      onClick={() => { setEditingName(p.id); setDraftName(displayName); }}
                      className="font-bold truncate text-left hover:underline decoration-dotted underline-offset-4">
                      {displayName || "Sin nombre"}
                    </button>
                  )}
                </div>
                <span className="flex items-center gap-2 text-sm font-semibold shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full ${stale ? "bg-orange-400" : st.dot}`} />
                  {stale ? "Reconectando…" : st.label}
                </span>
              </div>

              {isOpen && (<>
              {p.qrDataUrl && (
                <div className="mt-4 flex flex-col items-center">
                  <img src={p.qrDataUrl} alt="QR de WhatsApp" className="w-56 h-56" />
                  <p className="text-sm text-gray-500 mt-2">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                </div>
              )}
              {p.pairingCode && (
                <div className="mt-4 flex flex-col items-center">
                  <div className="text-3xl font-mono font-bold tracking-widest border-2 border-black rounded-lg px-4 py-3">{p.pairingCode}</div>
                  <p className="text-sm text-gray-500 mt-2 text-center">WhatsApp → Dispositivos vinculados → Vincular con número de teléfono → teclea este código</p>
                </div>
              )}

              {(p.groups.length > 0 || (p.status === "connected" && p.live)) && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">Grupos que atiende</span>
                    <span className="text-xs text-gray-400">{p.conversations} conv.</span>
                  </div>
                  {p.groups.length === 0 && <p className="text-xs text-gray-400">No se ven grupos aún. Solo responde en los que actives.</p>}
                  {(() => {
                    const active = p.groups.filter((g) => g.enabled);
                    const others = p.groups.filter((g) => !g.enabled);
                    const open = showAllGroups[p.id] ?? false;
                    const GroupRow = (g: { id: string; subject: string; enabled: boolean }) => (
                      <motion.div key={g.id} layout
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ type: "spring", stiffness: 500, damping: 34 }}>
                        <Switch value={g.enabled} label={g.subject}
                          className={`text-sm items-center ${g.enabled ? "font-semibold" : "text-gray-600"}`}
                          onChange={(on) => fetcher.submit({ intent: "toggle-group", poolId: p.id, groupId: g.id, on: on ? "1" : "0" }, { method: "post" })} />
                      </motion.div>
                    );
                    return (
                      <div className="flex flex-col gap-1.5">
                        <AnimatePresence mode="popLayout" initial={false}>
                          {active.map(GroupRow)}
                          {open && others.map(GroupRow)}
                        </AnimatePresence>
                        {others.length > 0 && (
                          <button type="button" onClick={() => setShowAllGroups((s) => ({ ...s, [p.id]: !open }))}
                            className="self-start text-xs text-brand-500 font-semibold mt-1 hover:underline">
                            {open ? "Ocultar grupos no activos" : `+ ${others.length} grupo${others.length !== 1 ? "s" : ""} no activo${others.length !== 1 ? "s" : ""}`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {p.enabledCount === 0 && p.groups.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">⚠️ Sin grupos activos: el agente no responde a nadie (anti-spam).</p>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 items-center">
                {p.status !== "connecting" && p.status !== "qr_pending" && p.status !== "pairing" && !(p.status === "connected" && p.live) && (
                  <>
                    <button disabled={isBusy("connect", p.id)} onClick={() => fetcher.submit({ intent: "connect", poolId: p.id }, { method: "post" })}
                      className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                      {isBusy("connect", p.id) ? <Spinner /> : "Conectar con QR"}
                    </button>
                    <span className="text-xs text-gray-400">o</span>
                    <input value={phones[p.id] ?? ""} onChange={(e) => setPhones((s) => ({ ...s, [p.id]: e.target.value }))}
                      placeholder="52155..." className="border-2 border-black rounded-lg px-2 py-1.5 text-sm w-32 font-mono" />
                    <button disabled={isBusy("connect", p.id) || !(phones[p.id] ?? "").trim()}
                      onClick={() => fetcher.submit({ intent: "connect", poolId: p.id, phone: phones[p.id] }, { method: "post" })}
                      className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
                      Vincular con número
                    </button>
                  </>
                )}
                {(p.live || p.status === "connecting" || p.status === "qr_pending" || p.status === "pairing") && (
                  <button disabled={isBusy("disconnect", p.id)} onClick={() => fetcher.submit({ intent: "disconnect", poolId: p.id }, { method: "post" })}
                    className="border-2 border-black rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                    {isBusy("disconnect", p.id) ? <Spinner /> : "Desconectar"}
                  </button>
                )}
                <button disabled={isBusy("delete", p.id)}
                  onClick={() => { if (confirm(`¿Borrar el agente "${displayName || "Sin nombre"}"? Se destruyen sus sandboxes y datos.`)) fetcher.submit({ intent: "delete", poolId: p.id }, { method: "post" }); }}
                  className="ml-auto border-2 border-red-300 text-red-600 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                  {isBusy("delete", p.id) ? <Spinner /> : "Borrar"}
                </button>
              </div>
              </>)}
            </div>
          );
        })}
      </div>

      {sharedPools.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            Compartidas conmigo
          </h3>
          <div className="grid gap-2">
            {sharedPools.map((p) => {
              const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
              return (
                <div
                  key={p.id}
                  className="border-2 border-black rounded-xl p-3 flex items-center justify-between gap-2 bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name || "Pool"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      Compartido por {p.ownerEmail ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs flex items-center gap-1.5 text-gray-600">
                    <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
