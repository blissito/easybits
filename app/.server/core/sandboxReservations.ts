/**
 * Reserved pool capacity ("sandboxes" tab in /dash/packs).
 *
 * A reservation is NOT a host VM. It's a capacity grant: each ACTIVE row raises
 * the owner's elastic-pool budget by +1 machine slot and +`agents` agent slots
 * (consumed on demand by the pool's normal spawn path). Billing is a dedicated
 * monthly Stripe subscription created via Checkout; the webhook records the
 * reservation on success and cancels it when that subscription is deleted.
 *
 * This is deliberately separate from the standalone permanent machines in the
 * `Sandbox` model (/dash/hosting), which provision a real always-on VM.
 */

import { db } from "../db";

/** Estimated worker density per VM RAM (mirrors the packs UI). */
export const agentsForMemory = (mb: number) => Math.max(2, Math.round(mb / 410));

/** Idempotent: a retried webhook for the same subscription is a no-op. */
export async function recordReservation(params: {
  ownerId: string;
  tier: string;
  agents: number;
  stripeSubscriptionId: string;
}) {
  const existing = await db.sandboxReservation.findUnique({
    where: { stripeSubscriptionId: params.stripeSubscriptionId },
  });
  if (existing) return existing;
  return db.sandboxReservation.create({ data: { ...params, status: "active" } });
}

/** Subscription cancelled → free the reserved capacity. */
export async function cancelReservationBySubscription(stripeSubscriptionId: string) {
  await db.sandboxReservation.updateMany({
    where: { stripeSubscriptionId, status: "active" },
    data: { status: "cancelled" },
  });
}

/** Sum of an owner's ACTIVE reservations → extra machine + agent budget.
 * Capacity is bought in flat boxes (4 agents = 1 pool VM), so a single row may
 * cover several boxes. Machines are derived from agents (ceil ÷ 4) rather than
 * row count, which keeps the VM budget correct for multi-box purchases. */
export async function getReservedCapacity(
  ownerId: string,
): Promise<{ machines: number; agents: number }> {
  const rows = await db.sandboxReservation.findMany({
    where: { ownerId, status: "active" },
    select: { agents: true },
  });
  const agents = rows.reduce((sum, r) => sum + r.agents, 0);
  const machines = rows.reduce((sum, r) => sum + Math.ceil(r.agents / 4), 0);
  return { machines, agents };
}
