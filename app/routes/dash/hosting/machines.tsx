import { useEffect, useMemo, useState } from "react";
import { useFetcher, data } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import type { Route } from "./+types/machines";
import { getUserOrRedirect } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import {
  listSandboxes,
  suspendSandbox,
  resumeSandbox,
  destroySandbox,
  exposeSandboxPort,
} from "~/.server/core/sandboxOperations";
import {
  listPermanent,
  createPermanent,
  releasePermanent,
  restoreMachine,
  makePermanent,
} from "~/.server/core/machineOperations";
import { HOSTING_CATALOG, TIER_ORDER, DISK_ADDON_GB, DISK_ADDON_PRICE } from "~/lib/hostingCatalog";
import { getUserPlan, isPaidPlan } from "~/lib/plans";
import { WaPanel } from "./WaPanel";
import { BrutalButton } from "~/components/common/BrutalButton";
import { ConfirmDialog } from "~/components/common/ConfirmDialog";
import { ThankYouModal } from "~/components/common/ThankYouModal";
import {
  LuServer, LuCpu, LuMemoryStick, LuHardDrive, LuTrash2,
  LuPlay, LuPause, LuRocket, LuPlus, LuClock, LuTriangleAlert, LuExternalLink, LuLoader, LuMessageCircle, LuRotateCcw,
} from "react-icons/lu";

// Tiny date "DD MMM" + days remaining in the 7-day soft-delete grace.
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
const daysLeft = (iso: string | null) => {
  if (!iso) return 7;
  const purge = new Date(iso).getTime() + 7 * 864e5;
  return Math.max(0, Math.ceil((purge - Date.now()) / 864e5));
};

export const meta = () => [{ title: "Máquinas — EasyBits" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  const [permanents, hostList] = await Promise.all([
    listPermanent(ctx).catch(() => []),
    listSandboxes(ctx).catch(() => []),
  ]);
  const permIds = new Set(permanents.map((p) => p.sandboxId));
  const rawEphemerals = (Array.isArray(hostList) ? hostList : []).filter((s) => !permIds.has(s.sandboxId));

  // For running livekit-svc sandboxes, call exposeSandboxPort to get (or re-register) the real URL.
  const ephemerals = await Promise.all(
    rawEphemerals.map(async (s) => {
      let studioUrl: string | null = null;
      if (s.template === "livekit-svc" && s.status === "running") {
        const ep = await exposeSandboxPort(ctx, s.sandboxId, 8088).catch(() => null);
        if (ep) studioUrl = ep.url.replace(/\/$/, "") + "/room";
      }
      return { sandboxId: s.sandboxId, template: s.template, status: s.status as string, expiresAt: s.expiresAt, studioUrl };
    })
  );
  const plan = getUserPlan(user);
  const tiers = TIER_ORDER.map((k) => {
    const t = HOSTING_CATALOG[k];
    return {
      key: t.key, vcpus: t.vcpus, memoryMb: t.memoryMb, diskMb: t.diskMb,
      priceShared: t.priceShared, priceReserved: t.priceReserved, byRequest: t.vcpus > 8,
    };
  });
  const { PLANS: plansMap } = await import("~/lib/plans");
  const sandboxLimit = plansMap[plan]?.concurrentSandboxes ?? 2;
  const activeSandboxes = ephemerals.filter((s) => s.status === "running" || s.status === "starting").length;
  // Next charge = the plan subscription's period end (all machines bill on that
  // same invoice cycle). One Stripe read, only when there are machines billing.
  let nextChargeAt: string | null = null;
  if (permanents.some((p) => p.status !== "pending_deletion")) {
    const { getActivePlanSubscription } = await import("~/.server/stripe_machines");
    const sub = await getActivePlanSubscription(user).catch(() => null);
    if (sub?.current_period_end) nextChargeAt = new Date(sub.current_period_end * 1000).toISOString();
  }
  return {
    permanents, ephemerals, plan, paid: isPaidPlan(plan),
    reservedEnabled: process.env.HOSTING_RESERVED_ENABLED === "1",
    tiers, diskAddon: { gb: DISK_ADDON_GB, price: DISK_ADDON_PRICE },
    sandboxLimit, activeSandboxes, nextChargeAt,
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
      case "restore": await restoreMachine(ctx, id); return { ok: true as const };
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
// Formatea ms restantes como cuenta regresiva con segundos: "2h 59m 58s",
// "12m 33s", "45s". Mostrar los segundos hace evidente que es un contador que
// se agota (no la edad de la máquina).
const fmtLeft = (ms: number) => {
  if (ms <= 0) return "expirando…";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
};

// Contador vivo: re-renderiza cada segundo para que el TTL baje a la vista.
const Countdown = ({ expiresAt }: { expiresAt: string | null }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  return (
    <span className="flex items-center gap-1 tabular-nums" title="Se auto-destruye al llegar a 0">
      <LuClock size={13} /> {fmtLeft(ms)}
    </span>
  );
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

// Managed-runtime readiness (ghostyclaw etc.): starting → ready | error.
const RUNTIME_PILL: Record<string, string> = {
  starting: "bg-amber-200",
  ready: "bg-green-200",
  error: "bg-red-200",
};
const RuntimePill = ({ status }: { status: string | null }) =>
  status ? (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border-2 border-black ${RUNTIME_PILL[status] || "bg-gray-200"}`}>
      runtime: {status}
    </span>
  ) : null;

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
  const { permanents, ephemerals, paid, reservedEnabled, tiers, diskAddon, sandboxLimit, activeSandboxes, nextChargeAt } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const [modal, setModal] = useState<null | { promoteId?: string }>(null);
  const [confirm, setConfirm] = useState<null | { intent: string; id: string; title: string; message: string }>(null);
  const [thanks, setThanks] = useState(false);
  // IDs being destroyed/released so we can animate them out
  const [destroyingIds, setDestroyingIds] = useState<Set<string>>(new Set());
  // IDs being suspended/resumed
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  // sandboxId whose WhatsApp pairing panel is open (flagship agents only)
  const [waOpen, setWaOpen] = useState<string | null>(null);

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
      setDestroyingIds(new Set());
      setLoadingIds(new Set());
      if ("created" in fetcher.data && fetcher.data.created) setThanks(true);
    }
    if (fetcher.state === "idle" && fetcher.data && "error" in fetcher.data) {
      setDestroyingIds(new Set());
      setLoadingIds(new Set());
    }
  }, [fetcher.state, fetcher.data]);

  const submit = (fields: Record<string, string>) => {
    const intent = fields.intent;
    const id = fields.sandboxId;
    if (id && (intent === "destroy" || intent === "release")) {
      setDestroyingIds((s) => new Set(s).add(id));
    } else if (id && (intent === "suspend" || intent === "resume")) {
      setLoadingIds((s) => new Set(s).add(id));
    }
    fetcher.submit(fields, { method: "post" });
  };
  const err = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <motion.article
      className="pt-20 px-6 md:px-8 pb-24 md:pl-36 w-full max-w-5xl"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <motion.header
        className="flex items-center justify-between mb-2 flex-wrap gap-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-2">
          <LuServer /> Máquinas
        </h1>
      </motion.header>
      <motion.p
        className="text-iron text-sm mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        VMs always-on con cobro flat al mes, y tus sandboxes efímeros.
      </motion.p>

      <AnimatePresence>
        {err && (
          <motion.div
            key="error"
            className="mb-6 p-3 bg-brand-red/10 border-2 border-brand-red rounded-xl text-sm font-bold text-brand-red"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            {err}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column bento layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* LEFT — Sandboxes (efímeros) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-iron">Sandboxes</h2>
            <SandboxSlots used={activeSandboxes} total={sandboxLimit} />
          </div>
          <AnimatePresence mode="popLayout">
            {ephemerals.length === 0 ? (
              <motion.div key="empty-eph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Empty>Sin sandboxes activos. Tus agentes los crean por SDK/MCP.</Empty>
              </motion.div>
            ) : ephemerals.map((s, i) => {
              const suspended = s.status === "suspended";
              const isDestroying = destroyingIds.has(s.sandboxId);
              const isLoading = loadingIds.has(s.sandboxId);
              return (
                <motion.div
                  key={s.sandboxId}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: isDestroying ? 0.45 : 1, y: 0, scale: isDestroying ? 0.98 : 1 }}
                  exit={{ opacity: 0, x: -80, scale: 0.88, filter: "blur(4px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
                  transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
                  className="mb-3"
                >
                  <Card status={s.status}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm truncate">{s.sandboxId}</span>
                        <StatusPill status={s.status} />
                      </div>
                      <p className="text-sm text-iron mt-1 flex items-center gap-3 flex-wrap">
                        <span>{s.template}</span>
                        {!suspended && <Countdown expiresAt={s.expiresAt} />}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.studioUrl && s.status === "running" && (
                        <a href={s.studioUrl} target="_blank" rel="noopener noreferrer"
                          title="Abrir sala"
                          className="flex items-center gap-1 p-2 rounded-lg border-2 border-black bg-white hover:bg-brand-100 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5">
                          <LuExternalLink size={16} />
                        </a>
                      )}
                      {isLoading ? (
                        <span className="p-2 text-brand-500 animate-spin"><LuLoader size={16} /></span>
                      ) : suspended ? (
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
                      {isDestroying ? (
                        <span className="p-2 text-brand-red animate-spin"><LuLoader size={16} /></span>
                      ) : (
                        <IconBtn title="Destruir" danger
                          onClick={() => setConfirm({ intent: "destroy", id: s.sandboxId, title: "Destruir sandbox", message: "Se elimina la VM y sus datos. No se puede deshacer." })}>
                          <LuTrash2 size={16} />
                        </IconBtn>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.section>

        {/* RIGHT — Permanentes */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.22 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-iron">Permanentes</h2>
            {paid && (
              <button type="button" onClick={() => setModal({})}
                className="text-xs font-bold text-brand-500 hover:underline flex items-center gap-1">
                <LuPlus size={13} /> Nueva
              </button>
            )}
          </div>

          {!paid && (
            <div className="p-4 bg-brand-100 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] mb-3">
              <p className="font-bold text-sm mb-1">Requiere plan Mega o Tera.</p>
              <a href="/planes" className="text-xs font-bold text-brand-500 hover:underline">Ver planes →</a>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {permanents.length === 0 ? (
              <motion.div key="empty-perm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Empty>Sin máquinas permanentes.</Empty>
              </motion.div>
            ) : permanents.map((m, i) => {
              const isDestroying = destroyingIds.has(m.sandboxId);
              return (
                <motion.div
                  key={m.sandboxId}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: isDestroying ? 0.45 : 1, y: 0, scale: isDestroying ? 0.98 : 1 }}
                  exit={{ opacity: 0, x: -80, scale: 0.88, filter: "blur(4px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
                  transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
                  className="mb-3"
                >
                  <Card status={m.status}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm truncate">{m.name || m.sandboxId}</span>
                        <StatusPill status={m.status} />
                        {m.cpuMode === "reserved" && (
                          <span className="text-[10px] font-bold bg-brand-500 text-white px-1.5 py-0.5 rounded-full">RESERVED</span>
                        )}
                        {m.shared && (
                          <span className="text-[10px] font-bold bg-black text-white px-1.5 py-0.5 rounded-full">COMPARTIDA</span>
                        )}
                        {m.status !== "pending_deletion" && <RuntimePill status={m.runtimeStatus} />}
                      </div>
                      <Specs vcpus={m.vcpus} memoryMb={m.memoryMb} diskMb={m.diskMb} />
                      {m.status === "pending_deletion" ? (
                        <p className="mt-1 text-xs font-bold text-brand-red flex items-center gap-1">
                          <LuTriangleAlert size={12} /> Programada para borrado · se elimina en {daysLeft(m.deletionScheduledAt)} días (restaurable).
                        </p>
                      ) : (
                        <p className="text-xs font-black mt-1">
                          ${m.monthlyMxn.toLocaleString("es-MX")}/mes <span className="font-normal text-iron">· {m.tier}</span>
                          {nextChargeAt && <span className="block text-[10px] font-normal text-iron mt-0.5">próx. cobro: {fmtDate(nextChargeAt)}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === "pending_deletion" ? (
                        !m.shared && (
                          <button type="button"
                            onClick={() => submit({ intent: "restore", sandboxId: m.sandboxId })}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg border-2 border-black bg-brand-500 text-white text-xs font-bold transition-all hover:-translate-x-0.5 hover:-translate-y-0.5">
                            <LuRotateCcw size={14} /> Restaurar
                          </button>
                        )
                      ) : (
                        <>
                          {m.template === "ghostyclaw" && (
                            <IconBtn title="WhatsApp" onClick={() => setWaOpen(waOpen === m.sandboxId ? null : m.sandboxId)}>
                              <LuMessageCircle size={16} />
                            </IconBtn>
                          )}
                          {/* Soft-delete: owner-only (a delegate/shared gets 404 → hide). Reversible 7d. */}
                          {!m.shared && (isDestroying ? (
                            <span className="p-2 text-iron animate-spin"><LuLoader size={16} /></span>
                          ) : (
                            <button type="button" title="Liberar (suspende + borra en 7 días, restaurable)"
                              onClick={() => setConfirm({ intent: "release", id: m.sandboxId, title: "Liberar máquina",
                                message: "Se corta el cobro y se suspende (datos intactos). Queda restaurable por 7 días; luego se elimina definitivamente." })}
                              className="flex items-center gap-1 px-2.5 py-2 rounded-lg border-2 border-black bg-white hover:bg-red-50 text-brand-red text-xs font-bold transition-all hover:-translate-x-0.5 hover:-translate-y-0.5">
                              <LuTrash2 size={14} /> Liberar
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </Card>
                  {waOpen === m.sandboxId && m.status !== "pending_deletion" && <WaPanel sandboxId={m.sandboxId} />}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.section>

      </div>

      <AnimatePresence>
        {modal && (
          <CreateModal
            key="create-modal"
            promoteId={modal.promoteId} tiers={tiers} diskAddon={diskAddon} reservedEnabled={reservedEnabled}
            busy={busy} onClose={() => setModal(null)} onSubmit={submit}
          />
        )}
      </AnimatePresence>

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
    </motion.article>
  );
}

const SandboxSlots = ({ used, total }: { used: number; total: number }) => (
  <span className="flex items-center gap-1" title={`${used} de ${total} slots activos`}>
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} className={`w-2.5 h-2.5 rounded-sm border border-black ${i < used ? "bg-lime" : "bg-gray-100"}`} />
    ))}
    <span className="text-xs text-iron ml-1">{used}/{total}</span>
  </span>
);

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
    <motion.div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="bg-white border-2 border-black rounded-xl p-6 w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
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
      </motion.div>
    </motion.div>
  );
}

const ModeBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border-2 border-black flex items-center justify-center gap-1 ${active ? "bg-brand-500 text-white" : "bg-white"}`}>
    {children}
  </button>
);
