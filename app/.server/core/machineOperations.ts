/**
 * Always-on VM hosting ("máquinas permanentes") — orchestration layer.
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
  suspendSandboxRaw,
  type SandboxRecord,
} from "./sandboxOperations";
import {
  getActivePlanSubscription,
  addMachineSubscriptionItem,
  removeMachineSubscriptionItem,
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
  };
}

function fail(status: number, error: string, message: string, extra?: object): never {
  throw new Response(
    JSON.stringify({ error, message, ...extra }),
    { status, headers: { "content-type": "application/json" } }
  );
}

/** Throw a Response if the user can't provision this tier/cpuMode. */
function assertCanProvision(ctx: AuthContext, tier: HostingTier, mode: CpuMode): void {
  const plan = getUserPlan(ctx.user);
  if (!isPaidPlan(plan)) {
    fail(403, "MachineSubscriptionRequired",
      "Necesitas un plan de pago (Mega o Tera) para crear máquinas permanentes.");
  }
  if (PLAN_RANK[plan] < PLAN_RANK[tier.minPlan]) {
    fail(403, "MachinePlanRequired",
      `El tier "${tier.key}" requiere el plan ${tier.minPlan} o superior.`,
      { requested: tier.key, requiredPlan: tier.minPlan, currentPlan: plan });
  }
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
  const subscription = await getActivePlanSubscription(ctx.user);
  if (!subscription) {
    await onRollback();
    fail(403, "MachineSubscriptionRequired",
      "No encontramos una suscripción de plan activa. Suscríbete a un plan para crear máquinas.");
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
      `No se pudo crear el cobro de la máquina: ${e instanceof Error ? e.message : String(e)}`);
  }
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

  const row = await db.sandbox.create({
    data: {
      ownerId: ctx.user.id,
      sandboxId: sandbox.sandboxId,
      persistent: true,
      tier: tier.key,
      cpuMode: mode,
      diskAddonsGB,
      name: params.name ?? null,
      status: sandbox.status === "running" ? "running" : "provisioning",
    },
  });

  const result = await attachBilling(ctx, row as SandboxRow, tier, mode, diskAddonsGB, sandbox, async () => {
    await destroySandbox(ctx, sandbox.sandboxId).catch(() => undefined);
  });
  // Billing attached → lock the box against destroy/suspend. Done AFTER billing
  // so the rollback above (a normal destroy) still works on failure. Only the
  // operator token can override the lock now (releasePermanent uses it).
  await persistSandbox(ctx, sandbox.sandboxId, { protected: true }).catch(() => undefined);

  // Managed-runtime templates (ghostyclaw, etc.): inject env + start the runtime
  // in the background (ghostyclaw readiness can take minutes — don't block the
  // create response). This is what lets a permanent Sandbox BE a configured
  // agent without a db.agent row. Best-effort: failure logs; the box stays.
  if (params.env && Object.keys(params.env).length) {
    void provisionRuntime(ctx, sandbox.sandboxId, template, params.env).catch((e) =>
      console.error(`provisionRuntime failed for ${sandbox.sandboxId}:`, e)
    );
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
    fail(409, "AlreadyPermanent", "Este sandbox ya es una máquina permanente.");
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
  await persistSandbox(ctx, sandboxId, { protected: true }).catch(() => undefined);
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
      status: { not: "destroyed" },
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
    fail(404, "MachineNotFound", "Máquina no encontrada.");
  }
  const { row: healed, host } = await selfHeal(ctx, row as SandboxRow);
  return toPermanent(healed, host, row.ownerId !== ctx.user.id);
}

export async function releasePermanent(ctx: AuthContext, sandboxId: string): Promise<{ ok: true }> {
  requireScope(ctx, "DELETE");
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.ownerId !== ctx.user.id || row.status === "destroyed") {
    fail(404, "MachineNotFound", "Máquina no encontrada.");
  }
  if (row.stripeSubItemId) {
    await removeMachineSubscriptionItem(row.stripeSubItemId).catch(() => undefined);
  }
  // Deliberate owner-initiated release (DELETE scope) → operator token so the
  // protection lock set at create/make time doesn't block the legitimate teardown.
  await destroySandbox(ctx, sandboxId, { asOperator: true }).catch(() => undefined);
  await db.sandbox.update({
    where: { sandboxId },
    data: { status: "destroyed", stripeSubItemId: null },
  });
  return { ok: true };
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
