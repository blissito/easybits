import { useEffect, useMemo, useState } from "react";
import { useFetcher, data } from "react-router";
import type { Route } from "./+types/machines";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import {
  listSandboxes,
  suspendSandbox,
  resumeSandbox,
  destroySandbox,
} from "~/.server/core/sandboxOperations";
import {
  listPermanent,
  createPermanent,
  releasePermanent,
  makePermanent,
} from "~/.server/core/machineOperations";
import { HOSTING_CATALOG, TIER_ORDER, DISK_ADDON_GB, DISK_ADDON_PRICE } from "~/lib/hostingCatalog";
import { getUserPlan, isPaidPlan } from "~/lib/plans";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import { ThankYouModal } from "~/components/common/ThankYouModal";
import {
  LuServer, LuCpu, LuMemoryStick, LuHardDrive, LuTrash2,
  LuPlay, LuPause, LuRocket, LuPlus, LuClock, LuTriangleAlert,
} from "react-icons/lu";

export const meta = () => [{ title: "Máquinas — EasyBits" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const [permanents, hostList] = await Promise.all([
    listPermanent(ctx).catch(() => []),
    listSandboxes(ctx).catch(() => []),
  ]);
  const permIds = new Set(permanents.map((p) => p.sandboxId));
  const ephemerals = (Array.isArray(hostList) ? hostList : [])
    .filter((s) => !permIds.has(s.sandboxId))
    .map((s) => ({ sandboxId: s.sandboxId, template: s.template, status: s.status as string, expiresAt: s.expiresAt }));
  const plan = getUserPlan(user);
  const tiers = TIER_ORDER.map((k) => {
    const t = HOSTING_CATALOG[k];
    return {
      key: t.key, vcpus: t.vcpus, memoryMb: t.memoryMb, diskMb: t.diskMb,
      priceShared: t.priceShared, priceReserved: t.priceReserved, byRequest: t.vcpus > 8,
    };
  });
  return {
    permanents, ephemerals, plan, paid: isPaidPlan(plan),
    reservedEnabled: process.env.HOSTING_RESERVED_ENABLED === "1",
    tiers, diskAddon: { gb: DISK_ADDON_GB, price: DISK_ADDON_PRICE },
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");
  const id = String(fd.get("sandboxId") || "");
  try {
    switch (intent) {
      case "create": {
        const created = await createPermanent(ctx, {
          tier: String(fd.get("tier")),
          cpuMode: fd.get("cpuMode") === "reserved" ? "reserved" : "shared",
          diskAddonsGB: Number(fd.get("diskAddonsGB") || 0),
          name: (String(fd.get("name") || "").trim() || undefined) as string | undefined,
        });
        return { ok: true as const, created };
      }
      case "promote":
        await makePermanent(ctx, id, { tier: String(fd.get("tier")) });
        return { ok: true as const };
      case "release": await releasePermanent(ctx, id); return { ok: true as const };
      case "destroy": await destroySandbox(ctx, id); return { ok: true as const };
      case "suspend": await suspendSandbox(ctx, id); return { ok: true as const };
      case "resume": await resumeSandbox(ctx, id); return { ok: true as const };
      default: return data({ error: "intent inválido" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.json().catch(() => ({ message: "Error" }));
      return data({ error: body.message || body.error || "Error", code: body.error }, { status: e.status });
    }
    return data({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
};

// ── helpers ──
const gb = (mb: number) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);
const ttl = (iso: string | null) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expirando…";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

const PILL: Record<string, string> = {
  running: "bg-lime", provisioning: "bg-brand-yellow", starting: "bg-brand-yellow",
  error: "bg-brand-red text-white", lost: "bg-gray-300", suspended: "bg-gray-300", stopped: "bg-gray-300",
};
const StatusPill = ({ status }: { status: string }) => (
  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border-2 border-black ${PILL[status] || "bg-gray-200"}`}>
    {status}
  </span>
);

const IconBtn = ({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button" title={title} aria-label={title} onClick={onClick}
    className={`p-2 rounded-lg border-2 border-black transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 ${danger ? "bg-brand-red text-white" : "bg-white hover:bg-brand-100"}`}
  >
    {children}
  </button>
);

type Tier = Awaited<ReturnType<typeof loader>>["tiers"][number];
const monthly = (t: Tier, mode: "shared" | "reserved", diskGB: number, diskPrice: number) => {
  const base = mode === "reserved" && t.priceReserved != null ? t.priceReserved : t.priceShared;
  return base + Math.round(diskGB / 100) * diskPrice;
};

export default function HostingMachines({ loaderData }: Route.ComponentProps) {
  const { permanents, ephemerals, paid, reservedEnabled, tiers, diskAddon } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const [modal, setModal] = useState<null | { promoteId?: string }>(null);
  const [confirm, setConfirm] = useState<null | { intent: string; id: string; title: string; message: string }>(null);
  const [thanks, setThanks] = useState(false);

  // ESC cierra modal/confirm
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setConfirm(null); setModal(null); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // cerrar modal al terminar un create/promote OK; agradecer si fue un create
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data) {
      setModal(null);
      if ("created" in fetcher.data && fetcher.data.created) setThanks(true);
    }
  }, [fetcher.state, fetcher.data]);

  const submit = (fields: Record<string, string>) => fetcher.submit(fields, { method: "post" });
  const err = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <article className="pt-20 px-6 md:px-8 pb-24 md:pl-36 w-full max-w-5xl">
      <header className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-2">
          <LuServer /> Máquinas
        </h1>
        {paid && (
          <BrutalButton size="chip" onClick={() => setModal({})} className="text-sm px-4 py-2">
            <span className="flex items-center gap-1"><LuPlus /> Nueva máquina</span>
          </BrutalButton>
        )}
      </header>
      <p className="text-iron text-sm mb-8">VMs always-on con cobro flat al mes, y tus sandboxes efímeros.</p>

      {err && (
        <div className="mb-6 p-3 bg-brand-red/10 border-2 border-brand-red rounded-xl text-sm font-bold text-brand-red">{err}</div>
      )}

      {!paid && (
        <div className="mb-8 p-6 bg-brand-100 border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-bold mb-1">Las máquinas permanentes requieren plan Mega o Tera.</p>
          <p className="text-sm text-iron mb-4">El plan es tu acceso; cada máquina factura flat al mes.</p>
          <a href="/planes"><BrutalButton size="chip" className="text-sm px-4 py-2">Ver planes</BrutalButton></a>
        </div>
      )}

      {/* Permanentes */}
      <section className="mb-10">
        <h2 className="text-sm font-black uppercase tracking-wider text-iron mb-3">Máquinas permanentes</h2>
        {permanents.length === 0 ? (
          <Empty>Aún no tienes máquinas permanentes.</Empty>
        ) : (
          <div className="grid gap-3">
            {permanents.map((m) => (
              <Card key={m.sandboxId} status={m.status}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold truncate">{m.name || m.sandboxId}</span>
                    <StatusPill status={m.status} />
                    {m.cpuMode === "reserved" && (
                      <span className="text-[10px] font-bold bg-brand-500 text-white px-1.5 py-0.5 rounded-full">RESERVED</span>
                    )}
                  </div>
                  <Specs vcpus={m.vcpus} memoryMb={m.memoryMb} diskMb={m.diskMb} />
                  <p className="text-sm font-black mt-1">${m.monthlyMxn.toLocaleString("es-MX")}/mes <span className="font-normal text-iron">· {m.tier}</span></p>
                  {m.status === "lost" && (
                    <p className="mt-2 text-xs font-bold text-brand-red flex items-center gap-1">
                      <LuTriangleAlert /> Se perdió pero sigue cobrando — libérala.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <IconBtn title="Liberar (corta cobro + destruye)" danger
                    onClick={() => setConfirm({ intent: "release", id: m.sandboxId, title: "Liberar máquina", message: "Se corta el cobro y se destruye la VM. No se puede deshacer." })}>
                    <LuTrash2 size={16} />
                  </IconBtn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Efímeros */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-wider text-iron mb-3">Sandboxes</h2>
        {ephemerals.length === 0 ? (
          <Empty>Sin sandboxes activos. Tus agentes los crean por SDK/MCP.</Empty>
        ) : (
          <div className="grid gap-3">
            {ephemerals.map((s) => {
              const t = ttl(s.expiresAt);
              const suspended = s.status === "suspended";
              return (
                <Card key={s.sandboxId} status={s.status}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm truncate">{s.sandboxId}</span>
                      <StatusPill status={s.status} />
                    </div>
                    <p className="text-sm text-iron mt-1 flex items-center gap-3 flex-wrap">
                      <span>{s.template}</span>
                      {t && <span className="flex items-center gap-1"><LuClock size={13} /> {t}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {suspended ? (
                      <IconBtn title="Reanudar" onClick={() => submit({ intent: "resume", sandboxId: s.sandboxId })}><LuPlay size={16} /></IconBtn>
                    ) : (
                      <IconBtn title="Suspender" onClick={() => submit({ intent: "suspend", sandboxId: s.sandboxId })}><LuPause size={16} /></IconBtn>
                    )}
                    <button
                      type="button" title="Hacer permanente (cobro flat al mes)"
                      onClick={() => { if (paid) setModal({ promoteId: s.sandboxId }); else window.location.assign("/planes"); }}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-lg border-2 border-black bg-brand-500 text-white text-xs font-bold transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                    >
                      <LuRocket size={14} /> Permanente
                    </button>
                    <IconBtn title="Destruir" danger
                      onClick={() => setConfirm({ intent: "destroy", id: s.sandboxId, title: "Destruir sandbox", message: "Se elimina la VM y sus datos. No se puede deshacer." })}>
                      <LuTrash2 size={16} />
                    </IconBtn>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {modal && (
        <CreateModal
          promoteId={modal.promoteId} tiers={tiers} diskAddon={diskAddon} reservedEnabled={reservedEnabled}
          busy={busy} onClose={() => setModal(null)} onSubmit={submit}
        />
      )}

      {thanks && <ThankYouModal kind="machine" onClose={() => setThanks(false)} />}

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirm?.title || ""}
        message={confirm?.message}
        confirmLabel={confirm?.intent === "release" ? "Liberar" : "Destruir"}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { if (confirm) submit({ intent: confirm.intent, sandboxId: confirm.id }); setConfirm(null); }}
      />
    </article>
  );
}

const Card = ({ status, children }: { status: string; children: React.ReactNode }) => (
  <div className={`flex items-center gap-4 p-4 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${status === "lost" || status === "error" ? "border-brand-red" : ""}`}>
    {children}
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="p-8 text-center text-sm font-bold text-gray-400 border-2 border-dashed border-gray-300 rounded-xl">{children}</div>
);

const Specs = ({ vcpus, memoryMb, diskMb }: { vcpus: number; memoryMb: number; diskMb: number }) => (
  <p className="text-sm text-iron mt-0.5 flex items-center gap-3 flex-wrap">
    <span className="flex items-center gap-1"><LuCpu size={13} /> {vcpus} vCPU</span>
    <span className="flex items-center gap-1"><LuMemoryStick size={13} /> {gb(memoryMb)}</span>
    <span className="flex items-center gap-1"><LuHardDrive size={13} /> {gb(diskMb)} NVMe</span>
  </p>
);

function CreateModal({
  promoteId, tiers, diskAddon, reservedEnabled, busy, onClose, onSubmit,
}: {
  promoteId?: string;
  tiers: Tier[];
  diskAddon: { gb: number; price: number };
  reservedEnabled: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (f: Record<string, string>) => void;
}) {
  const sellable = tiers.filter((t) => !t.byRequest);
  const [tierKey, setTierKey] = useState(sellable[0]?.key || "plus");
  const [mode, setMode] = useState<"shared" | "reserved">("shared");
  const [diskGB, setDiskGB] = useState(0);
  const [name, setName] = useState("");
  const tier = tiers.find((t) => t.key === tierKey)!;
  const canReserve = reservedEnabled && tier.priceReserved != null;
  const total = useMemo(() => monthly(tier, canReserve ? mode : "shared", diskGB, diskAddon.price), [tier, mode, diskGB, canReserve, diskAddon.price]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white border-2 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="text-lg font-black uppercase mb-4 flex items-center gap-2">
          {promoteId ? <><LuRocket /> Promover a permanente</> : <><LuPlus /> Nueva máquina</>}
        </h3>

        <label className="block mb-3">
          <span className="text-sm font-bold">Tier</span>
          <select value={tierKey} onChange={(e) => setTierKey(e.target.value)}
            className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm">
            {sellable.map((t) => (
              <option key={t.key} value={t.key}>
                {t.key} — {t.vcpus} vCPU / {gb(t.memoryMb)} — ${t.priceShared.toLocaleString("es-MX")}/mes
              </option>
            ))}
          </select>
        </label>

        {!promoteId && (
          <label className="block mb-3">
            <span className="text-sm font-bold">Nombre <span className="font-normal text-iron">(opcional)</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="mi-servidor"
              className="mt-1 block w-full border-2 border-black rounded-lg px-3 py-2 text-sm" />
          </label>
        )}

        {canReserve && (
          <fieldset className="mb-3">
            <legend className="text-sm font-bold mb-1">CPU</legend>
            <div className="flex gap-2">
              <ModeBtn active={mode === "shared"} onClick={() => setMode("shared")}>Shared</ModeBtn>
              <ModeBtn active={mode === "reserved"} onClick={() => setMode("reserved")}>Reserved <span className="text-[10px]">premium</span></ModeBtn>
            </div>
          </fieldset>
        )}

        <label className="block mb-4">
          <span className="text-sm font-bold">Disco extra <span className="font-normal text-iron">(+${diskAddon.price}/mes por {diskAddon.gb}GB)</span></span>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => setDiskGB((d) => Math.max(0, d - 100))} className="px-3 py-1 border-2 border-black rounded-lg font-bold">−</button>
            <span className="font-mono text-sm w-16 text-center">{diskGB} GB</span>
            <button type="button" onClick={() => setDiskGB((d) => Math.min(2000, d + 100))} className="px-3 py-1 border-2 border-black rounded-lg font-bold">+</button>
          </div>
        </label>

        <div className="flex items-center justify-between mb-4 p-3 bg-brand-100 border-2 border-black rounded-lg">
          <span className="text-sm font-bold">Total</span>
          <span className="text-xl font-black">${total.toLocaleString("es-MX")}/mes</span>
        </div>

        <div className="flex gap-2 justify-end">
          <BrutalButton mode="ghost" size="chip" className="text-sm px-4 py-1.5" onClick={onClose}>Cancelar</BrutalButton>
          <BrutalButton size="chip" isLoading={busy} className="text-sm px-4 py-1.5"
            onClick={() => onSubmit(promoteId
              ? { intent: "promote", sandboxId: promoteId, tier: tierKey }
              : { intent: "create", tier: tierKey, cpuMode: canReserve ? mode : "shared", diskAddonsGB: String(diskGB), name })}>
            {promoteId ? "Promover" : "Crear"}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}

const ModeBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border-2 border-black flex items-center justify-center gap-1 ${active ? "bg-brand-500 text-white" : "bg-white"}`}>
    {children}
  </button>
);
