/**
 * Always-on VM hosting ("sandboxes permanentes") — orchestration layer.
 *
 * ONE model, ONE id: the host's `sandboxId` is the single handle. A `Sandbox`
 * Mongo row exists only for PERMANENT (billed) sandboxes — `persistent`/`tier`/
 * `stripeSubItemId` are fields, "permanent" is the flag. Ephemeral sandboxes
 * stay host-only and are listed live from the host (merge in the UI).
 *
 * This wraps `sandboxOperations` (compute), `stripe_machines` (billing) and the
 * DB, surfaced via API v2, MCP `hosting` group and the SDK — all by sandboxId.
 *
 * MVP scope: shared-CPU, create/list/get/release + promote. Reserved CPU and
 * tiers >8 vCPU (performance-4x) are gated behind env flags / human approval
 * until the host contract lands (HOSTING_RESERVED_ENABLED / HOSTING_BIG_TIERS_ENABLED).
 */

import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { db } from "../db";
import {
  createSandboxRaw,
  destroySandbox,
  getSandbox,
  persistSandbox,
  provisionRuntime,
  suspendSandbox,
  resumeSandbox,
  suspendSandboxRaw,
  type SandboxRecord,
} from "./sandboxOperations";
import {
  getActivePlanSubscription,
  addMachineSubscriptionItem,
  removeMachineSubscriptionItem,
  createMachineCheckout,
  cancelMachineSubscription,
} from "../stripe_machines";
import {
  resolveTier,
  reservedAvailable,
  machineMonthly,
  resourcesFor,
  type CpuMode,
  type HostingTier,
} from "../../lib/hostingCatalog";
import { getUserPlan, isPaidPlan, type PlanKey } from "../../lib/plans";
import type { SandboxTemplate } from "../sandbox/schemas";
import { can, delegatedAccountIds, SCOPES } from "../delegation";
import { backupMachine, extendBackupsForDeletedMachine } from "./machineBackupOperations";

// Host clamp today is 8 vCPU; performance-4x (16) is by-request (human provisions).
const BIG_TIERS_ENABLED = process.env.HOSTING_BIG_TIERS_ENABLED === "1";
// Reserved CPU floor (cgroup) is a host fast-follow; off by default.
const RESERVED_ENABLED = process.env.HOSTING_RESERVED_ENABLED === "1";

const PLAN_RANK: Record<PlanKey, number> = { Byte: 0, Mega: 1, Tera: 2 };

/** A permanent sandbox as seen by API/SDK/MCP — addressed by sandboxId. */
export interface PermanentSandbox {
  sandboxId: string;
  ownerId: string;
  persistent: boolean;
  tier: string;
  cpuMode: CpuMode;
  diskAddonsGB: number;
  name: string | null;
  status: string;
  monthlyMxn: number;
  vcpus: number;
  memoryMb: number;
  diskMb: number;
  createdAt: Date;
  /** From the host record (when available) so the SDK can build a full Sandbox. */
  template: string | null;
  expiresAt: string | null;
  /** true when this machine is owned by another account that delegated it to me. */
  shared: boolean;
  /** managed-runtime readiness: "starting" | "ready" | "error" | null (plain machine). */
  runtimeStatus: string | null;
  /** soft-delete: when set, the machine is suspended + scheduled to hard-delete 7d after this. */
  deletionScheduledAt: string | null;
}

interface SandboxRow {
  sandboxId: string;
  ownerId: string;
  persistent: boolean;
  tier: string;
  cpuMode: string;
  diskAddonsGB: number;
  name: string | null;
  status: string;
  createdAt: Date;
  runtimeStatus?: string | null;
  deletionScheduledAt?: Date | null;
}

function toPermanent(row: SandboxRow, host?: SandboxRecord, shared = false): PermanentSandbox {
  const tier = resolveTier(row.tier);
  const mode = (row.cpuMode === "reserved" ? "reserved" : "shared") as CpuMode;
  const res = tier
    ? resourcesFor(tier, row.diskAddonsGB)
    : { vcpus: 0, memoryMb: 0, diskMb: 0 };
  return {
    sandboxId: row.sandboxId,
    ownerId: row.ownerId,
    persistent: row.persistent,
    tier: row.tier,
    cpuMode: mode,
    diskAddonsGB: row.diskAddonsGB,
    name: row.name,
    status: row.status,
    monthlyMxn: tier ? machineMonthly(tier, mode, row.diskAddonsGB) : 0,
    vcpus: res.vcpus,
    memoryMb: res.memoryMb,
    diskMb: res.diskMb,
    createdAt: row.createdAt,
    template: host?.template ?? null,
    expiresAt: host?.expiresAt ?? null,
    shared,
    runtimeStatus: row.runtimeStatus ?? null,
    deletionScheduledAt: row.deletionScheduledAt ? new Date(row.deletionScheduledAt).toISOString() : null,
  };
}

function fail(status: number, error: string, message: string, extra?: object): never {
  throw new Response(
    JSON.stringify({ error, message, ...extra }),
    { status, headers: { "content-type": "application/json" } }
  );
}

/**
 * Throw a Response if this tier/cpuMode can't be provisioned at all.
 *
 * NOTE (Aug 2026): hosting no longer requires a platform plan. A machine is now
 * its own Stripe subscription, so someone on Free pays for their box and
 * nothing else — asking them for a $299 plan on top of a $99 VPS was killing
 * the sale. The plan still gates AI, storage and fleet; it just stopped gating
 * hosting. What remains here are capability gates, not commercial ones.
 */
function assertCanProvision(_ctx: AuthContext, tier: HostingTier, mode: CpuMode): void {
  if (mode === "reserved") {
    if (!reservedAvailable(tier)) {
      fail(422, "ReservedNotAvailableForTier",
        `El tier "${tier.key}" solo ofrece CPU shared. Reserved está disponible desde focus.`);
    }
    if (!RESERVED_ENABLED) {
      fail(422, "ReservedComingSoon",
        "CPU reservada estará disponible próximamente. Por ahora usa shared.");
    }
  }
  // performance-4x (16 vCPU) is by-request — a human provisions it.
  if (tier.vcpus > 8 && !BIG_TIERS_ENABLED) {
    fail(422, "MachineTierByRequest",
      `El tier "${tier.key}" (enterprise) se aprovisiona por solicitud. Contáctanos para activarlo.`);
  }
}

// Shared tail: attach a Stripe item to a created row; rollback on failure.
async function attachBilling(
  ctx: AuthContext,
  row: SandboxRow & { id?: string },
  tier: HostingTier,
  mode: CpuMode,
  diskAddonsGB: number,
  host: SandboxRecord | undefined,
  onRollback: () => Promise<void>
): Promise<PermanentSandbox> {
  // Cortesía: la caja existe y se opera igual, pero no cuelga de ninguna
  // suscripción. Sin esto el cobro falla y el rollback destruye la máquina
  // recién creada, que es justo lo contrario de regalarla.
  if ((ctx.user as { courtesyHosting?: boolean }).courtesyHosting) {
    return toPermanent(row as SandboxRow, host);
  }
  const subscription = await getActivePlanSubscription(ctx.user);
  if (!subscription) {
    await onRollback();
    fail(403, "MachineSubscriptionRequired",
      "No encontramos una suscripción de plan activa. Suscríbete a un plan para crear sandboxes.");
  }
  const monthlyMxn = machineMonthly(tier, mode, diskAddonsGB);
  try {
    const subItemId = await addMachineSubscriptionItem({
      subscriptionId: subscription.id,
      monthlyMxn,
      machineId: row.sandboxId,
      tier: tier.key,
      cpuMode: mode,
    });
    const updated = await db.sandbox.update({
      where: { sandboxId: row.sandboxId },
      data: { stripeSubItemId: subItemId },
    });
    return toPermanent(updated as SandboxRow, host);
  } catch (e) {
    await db.sandbox.delete({ where: { sandboxId: row.sandboxId } }).catch(() => undefined);
    await onRollback();
    fail(502, "MachineBillingFailed",
      `No se pudo crear el cobro de el sandbox: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Start payment for a machine bought WITHOUT a platform plan.
 *
 * Returns a Stripe Checkout URL and provisions nothing: the box is born in the
 * webhook once the payment clears (`provisionPaidMachine`). No free compute, no
 * pending-machine rows to reconcile when someone abandons the checkout.
 */
export async function startMachineCheckout(
  ctx: AuthContext,
  params: {
    tier: string;
    cpuMode?: CpuMode;
    diskAddonsGB?: number;
    template?: SandboxTemplate;
    name?: string;
    successUrl?: string;
    cancelUrl?: string;
  }
): Promise<{ checkoutUrl: string; tier: string; monthlyMxn: number }> {
  requireScope(ctx, "WRITE");
  const tier = resolveTier(params.tier);
  if (!tier) fail(400, "UnknownTier", `Tier desconocido: "${params.tier}".`);
  const mode: CpuMode = params.cpuMode === "reserved" ? "reserved" : "shared";
  const diskAddonsGB = params.diskAddonsGB ?? 0;
  assertCanProvision(ctx, tier, mode);

  const monthlyMxn = machineMonthly(tier, mode, diskAddonsGB);
  const base = process.env.APP_URL || "https://www.easybits.cloud";
  const user = ctx.user as { id: string; email?: string | null; stripeId?: string | null; stripeIds?: string[] };
  const { url } = await createMachineCheckout({
    userId: user.id,
    email: user.email ?? null,
    customerId: user.stripeId || user.stripeIds?.[0] || null,
    monthlyMxn,
    tier: tier.key,
    cpuMode: mode,
    diskAddonsGB,
    template: params.template,
    name: params.name,
    successUrl: params.successUrl || `${base}/dash/hosting?paid=1`,
    cancelUrl: params.cancelUrl || `${base}/dash/hosting?canceled=1`,
  });
  return { checkoutUrl: url, tier: tier.key, monthlyMxn };
}

/**
 * Provision a machine whose STANDALONE subscription is already paid. Called
 * from the Stripe webhook, so there is no AuthContext — the owner comes from
 * the session metadata.
 *
 * Idempotent on `subscriptionId`: Stripe retries webhooks, and billing a
 * customer once but booting two VMs would be the worst possible bug here.
 */
export async function provisionPaidMachine(params: {
  ownerId: string;
  subscriptionId: string;
  tier: string;
  cpuMode: CpuMode;
  diskAddonsGB: number;
  template?: string;
  name?: string;
}): Promise<{ sandboxId: string } | null> {
  const existing = await db.sandbox.findFirst({
    where: { stripeSubscriptionId: params.subscriptionId },
    select: { sandboxId: true },
  });
  if (existing) return existing; // webhook replay

  const tier = resolveTier(params.tier);
  if (!tier) {
    console.error(`[hosting] paid machine with unknown tier "${params.tier}" — sub ${params.subscriptionId}`);
    return null;
  }
  // El dueño viene de la metadata del checkout, así que pudo dejar de existir
  // entre "pagué" y "Stripe nos avisó". Sin esta comprobación crearíamos una
  // máquina con dueño fantasma: nadie puede administrarla ni liberarla, y el
  // cobro sigue corriendo. Alguien PAGÓ, así que se grita y se deja la
  // suscripción intacta para que un humano reembolse o corrija.
  const owner = await db.user.findUnique({ where: { id: params.ownerId }, select: { id: true } });
  if (!owner) {
    console.error(
      `[hosting] CRITICAL: paid subscription ${params.subscriptionId} references a user that no longer exists (${params.ownerId}). NOT provisioning — needs a human.`
    );
    return null;
  }
  const res = resourcesFor(tier, params.diskAddonsGB);
  const template = (params.template ?? "ubuntu") as SandboxTemplate;
  const ctx = { user: { id: params.ownerId }, scopes: ["WRITE"] } as AuthContext;

  let sandbox: SandboxRecord;
  try {
    sandbox = await createSandboxRaw(ctx, {
      template,
      name: params.name,
      metadata: { eb_persistent: "1", eb_tier: tier.key, eb_cpu_mode: params.cpuMode },
      vcpus: res.vcpus,
      memoryMb: res.memoryMb,
      diskMb: res.diskMb,
      cpuMode: params.cpuMode,
    });
  } catch (e) {
    // They PAID and we couldn't deliver. Loud, and leave the subscription alone
    // so a human can refund or retry deliberately — silently cancelling
    // someone's subscription is worse than an alert.
    console.error(
      `[hosting] CRITICAL: paid subscription ${params.subscriptionId} (owner ${params.ownerId}, tier ${tier.key}) could not be provisioned:`,
      e
    );
    return null;
  }

  await db.sandbox.create({
    data: {
      ownerId: params.ownerId,
      sandboxId: sandbox.sandboxId,
      persistent: true,
      tier: tier.key,
      template,
      cpuMode: params.cpuMode,
      diskAddonsGB: params.diskAddonsGB,
      name: params.name ?? null,
      status: sandbox.status === "running" ? "running" : "provisioning",
      stripeSubscriptionId: params.subscriptionId,
      backupScope: "data",
    },
  });
  await lockBox(ctx, sandbox.sandboxId);
  return { sandboxId: sandbox.sandboxId };
}

/** Release the machine attached to a cancelled standalone subscription. */
export async function releaseMachineBySubscription(subscriptionId: string): Promise<void> {
  const row = await db.sandbox.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!row || row.status === "destroyed" || row.status === "pending_deletion") return;
  const ctx = { user: { id: row.ownerId }, scopes: ["DELETE"] } as AuthContext;
  // SOFT-delete, a diferencia de releasePermanent (que destruye en el acto).
  // Aquí nadie pidió borrar: se acabó el trial, falló una tarjeta, Stripe canceló.
  // Triturar los datos de alguien que puede re-suscribirse mañana sería absurdo,
  // así que la caja duerme 7 días y restoreMachine la revive intacta. El purge
  // del cron (purgeExpiredMachines) es quien la destruye si nadie vuelve.
  await backupMachine(row.sandboxId, { force: true }).catch(() => undefined);
  await suspendSandboxRaw(row.ownerId, row.sandboxId).catch(() => undefined);
  await db.sandbox.update({
    where: { sandboxId: row.sandboxId },
    data: { status: "pending_deletion", deletionScheduledAt: new Date(), stripeSubscriptionId: null },
  });
  void ctx;
}

/**
 * Buy a machine, whichever way the account can pay.
 *
 * - Has an active plan subscription → bill it as an item on that (one invoice,
 *   provisioned immediately) — the behaviour every existing machine relies on.
 * - No plan (Free) → return a Checkout URL for a standalone subscription; the
 *   box is born in the webhook once payment clears.
 *
 * Callers get either a machine or a `checkoutUrl`, never a plan-upsell error.
 */
export async function buyMachine(
  ctx: AuthContext,
  params: {
    tier: string;
    cpuMode?: CpuMode;
    diskAddonsGB?: number;
    template?: SandboxTemplate;
    name?: string;
    env?: Record<string, string>;
    successUrl?: string;
    cancelUrl?: string;
  }
): Promise<
  | { machine: PermanentSandbox; checkoutUrl?: undefined }
  | { checkoutUrl: string; tier: string; monthlyMxn: number; machine?: undefined }
> {
  requireScope(ctx, "WRITE");
  // Cortesía: cuentas invitadas y de la casa provisionan sin pasar por Stripe.
  // Va antes que el plan porque no hay suscripción que consultar, y se marca a
  // mano en la DB — la app nunca lo enciende sola.
  if ((ctx.user as { courtesyHosting?: boolean }).courtesyHosting) {
    return { machine: await createPermanent(ctx, params) };
  }
  const plan = await getActivePlanSubscription(ctx.user).catch(() => null);
  if (plan) return { machine: await createPermanent(ctx, params) };
  return startMachineCheckout(ctx, params);
}

/** Provision a fresh always-on machine. */
export async function createPermanent(
  ctx: AuthContext,
  params: {
    tier: string;
    cpuMode?: CpuMode;
    diskAddonsGB?: number;
    template?: SandboxTemplate;
    name?: string;
    // env: runtime config for a managed-runtime template (e.g. ghostyclaw needs
    // ANTHROPIC_API_KEY/NANOCLAW_ADMIN_TOKEN). When present, after billing we
    // inject it + start the runtime (provisionRuntime) — so a permanent Sandbox
    // hosts a configured agent WITHOUT the deprecated db.agent flow.
    env?: Record<string, string>;
  }
): Promise<PermanentSandbox> {
  requireScope(ctx, "WRITE");
  const tier = resolveTier(params.tier);
  if (!tier) fail(400, "UnknownTier", `Tier desconocido: "${params.tier}".`);
  const mode: CpuMode = params.cpuMode === "reserved" ? "reserved" : "shared";
  const diskAddonsGB = params.diskAddonsGB ?? 0;
  const template = (params.template ?? "ubuntu") as SandboxTemplate;

  assertCanProvision(ctx, tier, mode);

  const res = resourcesFor(tier, diskAddonsGB);
  let sandbox: SandboxRecord;
  try {
    sandbox = await createSandboxRaw(ctx, {
      template,
      name: params.name,
      metadata: { eb_persistent: "1", eb_tier: tier.key, eb_cpu_mode: mode },
      vcpus: res.vcpus,
      memoryMb: res.memoryMb,
      diskMb: res.diskMb,
      cpuMode: mode,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Host admission control rejected a reserved box (no reserved-vCPU capacity
    // on this box). Surface a clean 409 — NO Stripe item was created, so the
    // user is never charged premium for a VM we couldn't deliver.
    if (/CapacityExceeded|reserved vCPU cap/i.test(msg)) {
      fail(409, "MachineCapacityExceeded",
        "No hay capacidad de CPU reservada disponible en este box ahora mismo. Usa shared o intenta más tarde.");
    }
    if (/CapacityReached|RAM cap/i.test(msg)) {
      fail(503, "HostCapacityReached",
        "El host no tiene capacidad disponible ahora mismo. Intenta más tarde.");
    }
    fail(502, "MachineProvisionFailed",
      `No se pudo aprovisionar la VM: ${msg}`);
  }

  const hasRuntime = !!(params.env && Object.keys(params.env).length);
  const row = await db.sandbox.create({
    data: {
      ownerId: ctx.user.id,
      sandboxId: sandbox.sandboxId,
      persistent: true,
      tier: tier.key,
      template,
      cpuMode: mode,
      diskAddonsGB,
      name: params.name ?? null,
      status: sandbox.status === "running" ? "running" : "provisioning",
      // Admin Bearer for the box's :8787 API (pairing/CLAUDE.md via sandbox-admin
      // passthrough). Persisted from env, parallel to Agent.embedToken.
      adminToken: params.env?.NANOCLAW_ADMIN_TOKEN ?? null,
      runtimeStatus: hasRuntime ? "starting" : null,
    },
  });

  const result = await attachBilling(ctx, row as SandboxRow, tier, mode, diskAddonsGB, sandbox, async () => {
    await destroySandbox(ctx, sandbox.sandboxId).catch(() => undefined);
  });
  // Billing attached → lock the box against destroy/suspend. Done AFTER billing
  // so the rollback above (a normal destroy) still works on failure. Only the
  // operator token can override the lock now (releasePermanent uses it).
  await lockBox(ctx, sandbox.sandboxId);

  // Managed-runtime templates (ghostyclaw, etc.): inject env + start the runtime
  // in the background (ghostyclaw readiness can take minutes — don't block the
  // create response). This is what lets a permanent Sandbox BE a configured
  // agent without a db.agent row. Best-effort: failure logs; the box stays.
  if (hasRuntime) {
    void provisionRuntime(ctx, sandbox.sandboxId, template, params.env!)
      .then(() =>
        db.sandbox.update({ where: { sandboxId: sandbox.sandboxId }, data: { runtimeStatus: "ready" } })
      )
      .catch(async (e) => {
        console.error(`provisionRuntime failed for ${sandbox.sandboxId}:`, e);
        await db.sandbox
          .update({ where: { sandboxId: sandbox.sandboxId }, data: { runtimeStatus: "error" } })
          .catch(() => undefined);
      });
  }
  return result;
}

/**
 * Promote an EXISTING (ephemeral) sandbox to permanent: disarm the host reaper
 * (`persistSandbox`) so it survives past TTL, then register + bill it. Same
 * sandboxId throughout — no new id, no migration. The VM keeps its resources;
 * `tier` is what the user agrees to pay.
 */
export async function makePermanent(
  ctx: AuthContext,
  sandboxId: string,
  params: { tier: string; cpuMode?: CpuMode; diskAddonsGB?: number; name?: string }
): Promise<PermanentSandbox> {
  requireScope(ctx, "WRITE");
  const tier = resolveTier(params.tier);
  if (!tier) fail(400, "UnknownTier", `Tier desconocido: "${params.tier}".`);
  const mode: CpuMode = params.cpuMode === "reserved" ? "reserved" : "shared";
  const diskAddonsGB = params.diskAddonsGB ?? 0;

  assertCanProvision(ctx, tier, mode);

  const existing = await db.sandbox.findUnique({ where: { sandboxId } });
  if (existing && existing.status !== "destroyed") {
    fail(409, "AlreadyPermanent", "Este sandbox ya es un sandbox permanente.");
  }

  // Confirm it exists + belongs to the caller (host is owner-scoped).
  let host: SandboxRecord;
  try {
    host = await getSandbox(ctx, sandboxId);
  } catch {
    fail(404, "SandboxNotFound", "Sandbox no encontrado.");
  }

  // Disarm the reaper BEFORE billing — never charge for a VM that can be reaped.
  // Not protected yet (protected:false) so a failed promotion stays releasable
  // via the normal path; we lock it only after billing is attached (below).
  try {
    await persistSandbox(ctx, sandboxId, { protected: false });
  } catch (e) {
    fail(502, "PersistFailed",
      `No se pudo volver permanente la VM: ${e instanceof Error ? e.message : String(e)}`);
  }

  const row = await db.sandbox.upsert({
    where: { sandboxId },
    create: {
      ownerId: ctx.user.id,
      sandboxId,
      persistent: true,
      tier: tier.key,
      cpuMode: mode,
      diskAddonsGB,
      name: params.name ?? null,
      status: "running",
    },
    update: {
      ownerId: ctx.user.id,
      persistent: true,
      tier: tier.key,
      cpuMode: mode,
      diskAddonsGB,
      status: "running",
      stripeSubItemId: null,
    },
  });

  const result = await attachBilling(ctx, row as SandboxRow, tier, mode, diskAddonsGB, host, async () => {
    // Billing failed — the VM stays as the user's persistent sandbox, unbilled.
  });
  // Billing attached → lock against destroy/suspend (operator override only).
  await lockBox(ctx, sandboxId);
  return result;
}

// Map a sandbox status to our status. 404 / lost → "lost".
function sandboxToStatus(sb: SandboxRecord): string {
  if (sb.status === "running") return "running";
  if (sb.status === "starting") return "provisioning";
  if (sb.status === "error") return "error";
  return "lost";
}

const RECONCILE = new Set(["provisioning", "running", "error"]);

async function selfHeal(ctx: AuthContext, row: SandboxRow): Promise<{ row: SandboxRow; host?: SandboxRecord }> {
  if (!RECONCILE.has(row.status)) return { row };
  try {
    const host = await getSandbox(ctx, row.sandboxId);
    const real = sandboxToStatus(host);
    if (real !== row.status) {
      await db.sandbox.update({ where: { sandboxId: row.sandboxId }, data: { status: real } }).catch(() => undefined);
      return { row: { ...row, status: real }, host };
    }
    return { row, host };
  } catch (e) {
    if (e instanceof Error && /not found|404/i.test(e.message)) {
      await db.sandbox.update({ where: { sandboxId: row.sandboxId }, data: { status: "lost" } }).catch(() => undefined);
      return { row: { ...row, status: "lost" } };
    }
  }
  return { row };
}

export async function listPermanent(ctx: AuthContext): Promise<PermanentSandbox[]> {
  requireScope(ctx, "READ");
  // Owned machines + machines of accounts that delegated "machines" to me.
  const delegatedOwners = await delegatedAccountIds(ctx, SCOPES.MACHINES);
  const rows = await db.sandbox.findMany({
    where: {
      // `pending_deletion` fuera: una máquina que el dueño ya soltó no debe
      // seguir apareciendo aquí. El dashboard la filtraba de su lado pero
      // `list_machines` (MCP) no — el agente veía cajas "borradas" durante días
      // y reportaba que el borrado no funcionaba. getPermanent SÍ la resuelve,
      // para que restore_machine siga sirviendo en la vía Stripe.
      status: { notIn: ["destroyed", "pending_deletion"] },
      ownerId: { in: [ctx.user.id, ...delegatedOwners] },
    },
    orderBy: { createdAt: "desc" },
  });
  const healed = await Promise.all(rows.map((r) => selfHeal(ctx, r as SandboxRow)));
  return healed.map(({ row, host }) =>
    toPermanent(row, host, row.ownerId !== ctx.user.id)
  );
}

export async function getPermanent(ctx: AuthContext, sandboxId: string): Promise<PermanentSandbox> {
  requireScope(ctx, "READ");
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  // Owner OR a "machines" delegate of the owner's account may see it.
  const allowed =
    !!row &&
    row.status !== "destroyed" &&
    (row.ownerId === ctx.user.id || (await can(ctx, row.ownerId, SCOPES.MACHINES)));
  if (!row || !allowed) {
    fail(404, "MachineNotFound", "Sandbox no encontrado.");
  }
  const { row: healed, host } = await selfHeal(ctx, row as SandboxRow);
  return toPermanent(healed, host, row.ownerId !== ctx.user.id);
}

// HARD-DELETE. Owner-only. Borrar una máquina la DESTRUYE en el acto: para el
// cobro, toma un último backup y elimina la VM. Es lo que hace todo el mundo
// (Fly, DigitalOcean, Hetzner, Railway, Render): la red de seguridad no es una
// caja dormida que sigue apareciendo en `list_machines` durante una semana, es
// el backup — que queda 30 días y se restaura con list_backups +
// restore_machine_from_backup.
//
// La gracia de 7 días sobrevive SOLO en releaseMachineBySubscription (Stripe
// canceló, nadie pidió borrar nada). Ver ahí el porqué de la divergencia.
export async function releasePermanent(
  ctx: AuthContext,
  sandboxId: string
): Promise<{ ok: true; destroyed: true; backupId?: string }> {
  requireScope(ctx, "DELETE");
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.ownerId !== ctx.user.id || row.status === "destroyed") {
    fail(404, "MachineNotFound", "Sandbox no encontrado.");
  }
  // Stop the meter immediately — the owner asked to release it. Two billing
  // shapes: an item on the plan subscription, or a standalone subscription that
  // IS the machine. Cancelling the wrong one leaves the customer paying.
  if (row.stripeSubItemId) {
    await removeMachineSubscriptionItem(row.stripeSubItemId).catch(() => undefined);
  }
  if (row.stripeSubscriptionId) {
    await cancelMachineSubscription(row.stripeSubscriptionId).catch((e) => {
      console.error(`[hosting] could not cancel subscription ${row.stripeSubscriptionId}:`, e);
    });
  }
  // Último backup ANTES de destruir: ahora es la ÚNICA copia que queda, así que
  // vale más que cuando había 7 días de gracia detrás. Sigue siendo best-effort
  // (una máquina sin dataPaths no tiene nada que copiar) pero el fallo se grita.
  const backupId = await backupMachine(sandboxId, { force: true })
    .then((b) => b.id as string | undefined)
    .catch((e) => {
      console.error(
        `[hosting] final backup of ${sandboxId} failed before destroy — la máquina se borra SIN copia:`,
        e?.message ?? e
      );
      return undefined;
    });
  // Destruir de verdad. asOperator: la caja está Protected (lockBox la blindó al
  // cobrarla) y el host rechaza el destroy sin el token de operador.
  // NO best-effort: si el host no la borró, la fila NO puede decir "destroyed" —
  // eso deja una VM viva, sin cobro y sin dashboard que la vea (justo el
  // incidente de agosto 2026: seis cajas gratis una semana).
  try {
    await destroySandbox(ctx, sandboxId, { asOperator: true });
  } catch (e) {
    fail(502, "MachineDestroyFailed",
      `No pudimos destruir la máquina en el host: ${e instanceof Error ? e.message : String(e)}. El cobro ya se detuvo; reintenta el borrado.`);
  }
  await db.sandbox.update({
    where: { sandboxId },
    data: {
      status: "destroyed",
      stripeSubItemId: null,
      stripeSubscriptionId: null,
      deletionScheduledAt: null,
    },
  });
  // La VM ya no existe; el backup pasa a retención post-borrado (7 días). En el
  // cron esto va con .catch silencioso, aquí NO: si falla, la única copia del
  // cliente expira con la copia vieja y nadie se entera hasta que la pide.
  await extendBackupsForDeletedMachine(sandboxId).catch((e) => {
    console.error(
      `[hosting] CRITICAL: no se pudo extender la retención del backup de ${sandboxId} tras destruirla — no queda garantizada una semana completa desde el borrado:`,
      e
    );
  });
  return { ok: true, destroyed: true, backupId };
}

// Restore a soft-deleted machine within the 7-day grace: resume the VM + re-bill.
// Owner-only. Throws if not pending_deletion or already hard-purged.
export async function restoreMachine(ctx: AuthContext, sandboxId: string): Promise<PermanentSandbox> {
  requireScope(ctx, "WRITE");
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.ownerId !== ctx.user.id || row.status === "destroyed") {
    fail(404, "MachineNotFound", "Sandbox no encontrado.");
  }
  if (row.status !== "pending_deletion") {
    fail(409, "NotPendingDeletion", "Este sandbox no está programada para borrado.");
  }
  const tier = resolveTier(row.tier);
  if (!tier) fail(400, "UnknownTier", `Tier desconocido: "${row.tier}".`);
  const mode = (row.cpuMode === "reserved" ? "reserved" : "shared") as CpuMode;
  // Resume the VM from its snapshot (data intact), then re-attach billing.
  await resumeSandbox(ctx, sandboxId).catch(() => undefined);
  const cleared = await db.sandbox.update({
    where: { sandboxId },
    data: { status: "running", deletionScheduledAt: null },
  });
  return attachBilling(ctx, cleared as SandboxRow, tier, mode, row.diskAddonsGB, undefined, async () => {
    // Billing re-attach failed — leave it running but unbilled; owner can retry.
  });
}

/**
 * Lock a paid box against destroy/suspend, and MEAN it.
 *
 * `Protected` is the only thing standing between a customer's machine and the
 * host's 72h sweep of stale suspended boxes (sweepStaleSuspended runs whether
 * or not the box is Persistent). Setting it best-effort — `.catch(() => {})` —
 * meant one flaky call left a machine billed, permanent, and destroyable, with
 * nothing to ever notice. The host itself carries a comment about exactly that
 * outcome: "La caja y sus datos se perdieron".
 *
 * So: retry, and if it still fails, say so loudly. `reconcileProtection()`
 * below is the safety net that catches whatever slips through.
 */
async function lockBox(ctx: AuthContext, sandboxId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await persistSandbox(ctx, sandboxId, { protected: true });
      return true;
    } catch (e) {
      if (attempt === 2) {
        console.error(
          `[hosting] CRITICAL: could not protect paid machine ${sandboxId} after 3 tries — it is billed but destroyable by the host's stale sweep. reconcileProtection should pick it up.`,
          e
        );
        return false;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return false;
}

/**
 * Re-apply the destroy lock on every billed machine. Idempotent and cheap
 * (the host just sets a flag), so it runs on the same cron as the purge.
 *
 * Defense in depth: a machine the customer pays for must not be one failed
 * HTTP call away from deletion.
 */
export async function reconcileProtection(): Promise<{ checked: number; relocked: number }> {
  const rows = await db.sandbox.findMany({
    where: { persistent: true, status: { notIn: ["destroyed", "pending_deletion"] } },
    select: { sandboxId: true, ownerId: true },
  });
  let relocked = 0;
  for (const m of rows) {
    const ctx = { user: { id: m.ownerId }, scopes: ["WRITE"] } as AuthContext;
    const ok = await persistSandbox(ctx, m.sandboxId, { protected: true })
      .then(() => true)
      .catch(() => false);
    if (ok) relocked++;
  }
  return { checked: rows.length, relocked };
}

/**
 * Put a just-released box to sleep, and VERIFY it actually slept.
 *
 * The meter is already stopped by the time this runs, so an unnoticed failure
 * here is pure loss: the VM keeps its CPU/RAM reservation, `protected` keeps
 * the host's stale sweep off it, and the row says `pending_deletion` — so no
 * dashboard, alarm or reaper considers it alive. Retry, confirm against the
 * host, and if it still won't sleep, say so loudly. `reconcileReleasedBoxes()`
 * is the net that catches whatever slips through.
 *
 * Never throws: the release itself must complete (the customer asked for it and
 * we already cancelled their subscription).
 */
async function suspendReleasedBox(ctx: AuthContext, sandboxId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // asOperator: la caja está Protected (lockBox la blindó al cobrarla) y el
      // host rechaza el suspend sin el token de operador.
      await suspendSandbox(ctx, sandboxId, { asOperator: true });
    } catch {
      // fall through to the check — the host may have suspended it anyway
    }
    const state = await getSandbox(ctx, sandboxId)
      .then((rec) => rec.status as string)
      .catch(() => null);
    // Anything that is not awake is fine — asleep, stopped or already gone all
    // mean the box stopped costing us CPU and RAM.
    if (state === null || (state !== "running" && state !== "starting")) return true;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  console.error(
    `[hosting] CRITICAL: released machine ${sandboxId} would not suspend after 3 tries — it is UNBILLED and still running. reconcileReleasedBoxes should pick it up.`
  );
  return false;
}

/**
 * Re-suspend every released box that is somehow still running.
 *
 * Runs on the purge cron, next to reconcileProtection, and for the same reason:
 * a single failed HTTP call must not be able to strand a machine forever. A
 * host restart can also revive one on its own ("suspended without .mem snapshot
 * after restart"), which no amount of care at release time would have caught.
 */
export async function reconcileReleasedBoxes(): Promise<{ checked: number; resuspended: number; stuck: string[] }> {
  const rows = await db.sandbox.findMany({
    where: { status: "pending_deletion" },
    select: { sandboxId: true, ownerId: true },
  });
  let resuspended = 0;
  const stuck: string[] = [];
  for (const m of rows) {
    const ctx = { user: { id: m.ownerId }, scopes: ["WRITE"] } as AuthContext;
    const state = await getSandbox(ctx, m.sandboxId)
      .then((rec) => rec.status)
      .catch(() => null);
    if (state !== "running" && state !== "starting") continue;
    if (await suspendReleasedBox(ctx, m.sandboxId)) resuspended++;
    else stuck.push(m.sandboxId);
  }
  return { checked: rows.length, resuspended, stuck };
}

// Cron: hard-destroy machines whose 7-day grace has elapsed. Returns a summary.
const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export async function purgeExpiredMachines(): Promise<{ purged: number; ids: string[] }> {
  const cutoff = new Date(Date.now() - DELETION_GRACE_MS);
  const due = await db.sandbox.findMany({
    where: { status: "pending_deletion", deletionScheduledAt: { lt: cutoff } },
    select: { sandboxId: true, ownerId: true },
  });
  const ids: string[] = [];
  for (const m of due) {
    const ctx = { user: { id: m.ownerId }, scopes: ["DELETE"] } as AuthContext;
    await destroySandbox(ctx, m.sandboxId, { asOperator: true }).catch(() => undefined);
    await db.sandbox
      .update({ where: { sandboxId: m.sandboxId }, data: { status: "destroyed", deletionScheduledAt: null } })
      .catch(() => undefined);
    // The VM is gone; hold its last backup well past it. "I deleted it by
    // mistake" tends to surface after the grace window, not during it.
    await extendBackupsForDeletedMachine(m.sandboxId).catch(() => undefined);
    ids.push(m.sandboxId);
  }
  return { purged: ids.length, ids };
}

// Admin / fleet view — no owner scope. Caller must be admin-gated upstream.
export async function listAllPermanent(): Promise<PermanentSandbox[]> {
  const rows = await db.sandbox.findMany({
    where: { status: { not: "destroyed" } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPermanent(r as SandboxRow));
}

// Server-to-server: suspend a delinquent owner's permanent sandboxes (Stripe
// webhook on subscription cancel / payment failure). Best-effort.
export async function suspendOwnerSandboxes(ownerId: string): Promise<void> {
  const rows = await db.sandbox.findMany({
    where: { ownerId, status: { in: ["running", "provisioning"] } },
  });
  await Promise.all(
    rows.map(async (row) => {
      await suspendSandboxRaw(ownerId, row.sandboxId).catch(() => undefined);
      await db.sandbox
        .update({ where: { sandboxId: row.sandboxId }, data: { status: "suspended" } })
        .catch(() => undefined);
    })
  );
}
