import type { Route } from "./+types/pools";
import { useEffect, useState } from "react";
import { useFetcher, useRevalidator, data } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import QRCode from "qrcode";
import { Switch } from "~/components/forms/Switch";
import { PLANS, getUserPlan, NEXT_PLAN } from "~/lib/plans";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { createPool, deletePool } from "~/.server/core/poolOperations";
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
        select: { id: true, status: true },
      });
      const machines = await Promise.all(
        workers.map(async (w) => ({
          id: w.id,
          status: w.status,
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
  const capacity = {
    machines,
    vms: machines.length,
    maxMachines: planCfg.concurrentSandboxes,
    plan,
    planName: planCfg.name,
    nextPlan: NEXT_PLAN[plan] ?? null,
    maxWorkersPerVm,
    vmMemMb: pools[0]?.vmMemMb ?? 512,
    // Agents running RIGHT NOW = sum of workers inside active VMs (coherent with
    // "VMs contain agents"); idle/detached routes don't count until re-spawned.
    agentsActive: machines.reduce((s, m) => s + m.slots, 0),
    agentsMax: planCfg.concurrentSandboxes * maxWorkersPerVm,
  };
  return { secretNames, pools, capacity };
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
  machines: { id: string; status: string; slots: number }[];
  vms: number; maxMachines: number; plan: string; planName: string;
  nextPlan: string | null; maxWorkersPerVm: number; vmMemMb: number;
  agentsActive: number; agentsMax: number;
};

const SPAWN = { initial: { scale: 0.4, opacity: 0, y: 8 }, animate: { scale: 1, opacity: 1, y: 0 }, exit: { scale: 0.4, opacity: 0, y: 8 } };

// One sandbox = a CONTAINER box; the agents (workers) inside it are the ojitos.
// Color climbs with occupancy: empty→gray, healthy→green, full→amber (no room);
// building pulses yellow; an unspawned slot is a dashed "mount" ready on demand.
function VmBox({ id, status, slots, max }: { id: string; status: string | null; slots: number; max: number }) {
  const full = slots >= max;
  const frame =
    status === "building" ? "border-yellow-500 bg-yellow-50 animate-pulse"
    : status == null ? "border-gray-200 border-dashed bg-gray-50/40"
    : full ? "border-amber-500 bg-amber-50"
    : slots > 0 ? "border-green-500 bg-green-50"
    : "border-gray-300 bg-gray-50";
  const label = status == null ? "libre" : status === "building" ? "boot" : `${slots}/${max} agentes`;
  return (
    <motion.div
      layout {...SPAWN}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      whileHover={status == null ? { scale: 1.02 } : { scale: 1.05, y: -3 }}
      style={{ flexGrow: max, flexBasis: max * 56 }}
      title={status == null ? "Sandbox disponible — se levanta bajo demanda" : `Sandbox ${status} · ${slots}/${max} agentes`}
      className={`min-w-[100px] h-20 rounded-lg border-2 flex flex-col items-center justify-center gap-1.5 cursor-default hover:shadow-[3px_3px_0_rgba(0,0,0,0.15)] transition-shadow ${frame}`}
    >
      <div className="flex gap-1.5 items-center flex-wrap justify-center px-2">
        {Array.from({ length: max }).map((_, j) =>
          j < slots ? (
            <motion.img key={`a${j}`} src="/logo-purple.svg" alt="" className="w-6 h-6"
              initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 18, delay: j * 0.05 }} />
          ) : (
            <span key={`e${j}`} className="w-3 h-3 rounded-full border border-gray-300 bg-white/70" />
          )
        )}
      </div>
      <span className="font-jersey text-[13px] leading-none text-gray-500">{label}</span>
    </motion.div>
  );
}

function CapacityHud({ capacity }: { capacity: Capacity }) {
  const freeSlots = Math.max(0, capacity.maxMachines - capacity.machines.length);
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
          {capacity.vms}/{capacity.maxMachines} SANDBOXES · {capacity.agentsActive}/{capacity.agentsMax} AGENTES
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-stretch">
        <AnimatePresence mode="popLayout">
          {capacity.machines.map((m) => (
            <VmBox key={m.id} id={m.id} status={m.status} slots={m.slots} max={capacity.maxWorkersPerVm} />
          ))}
          {Array.from({ length: freeSlots }).map((_, i) => (
            <VmBox key={`free-${i}`} id={`free-${i}`} status={null} slots={0} max={capacity.maxWorkersPerVm} />
          ))}
          {/* Añadir capacidad — sube de plan para más sandboxes */}
          <motion.a key="add" layout {...SPAWN} href="/dash/packs" title="Añadir capacidad"
            whileHover={{ scale: 1.08, rotate: 2 }} whileTap={{ scale: 0.95 }}
            className="w-20 shrink-0 rounded-lg border-2 border-dashed border-brand-500 text-brand-500 flex flex-col items-center justify-center gap-0.5 hover:bg-brand-500/10">
            <span className="text-2xl leading-none">+</span>
            <span className="font-jersey text-[12px] leading-none">MÁS</span>
          </motion.a>
        </AnimatePresence>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        {capacity.vms === 0
          ? `Sin sandboxes activos — se levantan bajo demanda al llegar un mensaje. Tu plan ${capacity.planName} da ${capacity.maxMachines} sandbox${capacity.maxMachines !== 1 ? "es" : ""} (${capacity.agentsMax} agentes simultáneos).`
          : `${capacity.vmMemMb}MB por sandbox · cada uno contiene hasta ${capacity.maxWorkersPerVm} agentes.`}
        {capacity.nextPlan && <> Sube a <span className="font-semibold text-brand-500">{capacity.nextPlan}</span> para más capacidad.</>}
      </p>
    </div>
  );
}

export default function Pools({ loaderData }: Route.ComponentProps) {
  const { secretNames, pools, capacity } = loaderData;
  const fetcher = useFetcher();
  const rev = useRevalidator();
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
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => rev.revalidate(), 2500);
    return () => clearInterval(t);
  }, [polling, rev]);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Agentes de WhatsApp</h1>
      <p className="text-gray-500 mb-6">Crea un agente, conéctalo a WhatsApp y atiende tus grupos. Se levanta bajo demanda.</p>

      {/* Bento responsive: Capacidad a todo lo ancho arriba; luego Nuevo agente y
          los agentes fluyen en 2 columnas (desktop) y se apilan en mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

      {/* Capacidad — HUD estilo videojuego. Las VMs son CONTENEDORES; dentro
          viven los agentes (workers, render = ojitos de la marca). El color de
          cada VM sube según ocupación: gris (vacía) → morado (a medias) → verde
          (llena), amarillo si está booteando. Capacidad = plan de la cuenta. */}
      <CapacityHud capacity={capacity} />

      {/* Nuevo agente */}
      <div className="border-2 border-black rounded-xl p-4 animate-fade-in">
        <span className="font-bold block mb-3">Nuevo agente</span>
        <fetcher.Form method="post" className="flex flex-col gap-3">
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

          <button disabled={isBusy("create")} className="self-start bg-brand-500 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-60">
            {isBusy("create") ? <Spinner /> : "+ Crear Agente"}
          </button>
        </fetcher.Form>
      </div>

      {pools.length === 0 && <p className="lg:col-span-2 text-gray-400">Aún no tienes agentes.</p>}
        {pools.map((p) => {
          const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.disconnected;
          const stale = p.status === "connected" && !p.live;
          return (
            <div key={p.id} className="border-2 border-black rounded-xl p-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="font-bold">{p.name || "Sin nombre"}</div>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`w-2.5 h-2.5 rounded-full ${stale ? "bg-orange-400" : st.dot}`} />
                  {stale ? "Reconectando…" : st.label}
                </span>
              </div>

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
                  onClick={() => { if (confirm(`¿Borrar el agente "${p.name || "Sin nombre"}"? Se destruyen sus sandboxes y datos.`)) fetcher.submit({ intent: "delete", poolId: p.id }, { method: "post" }); }}
                  className="ml-auto border-2 border-red-300 text-red-600 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                  {isBusy("delete", p.id) ? <Spinner /> : "Borrar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
