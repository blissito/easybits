/**
 * Per-machine billing for the always-on VM hosting product.
 *
 * Model (simplified): ONE Stripe subscription item per machine, appended to
 * the user's existing platform-plan subscription. The item's `unit_amount`
 * already combines the tier price + disk add-ons (see `machineMonthly`), so a
 * resize or a disk change just re-prices the same item. Machines bill on the
 * same invoice cycle as the plan → one invoice, clean UX.
 *
 * The plan subscription is the ACCESS GATE: no active plan subscription ⇒ no
 * machine (`getActivePlanSubscription` returns null).
 */

import type { Stripe } from "stripe";
import { getStripe } from "./stripe";

// Shared Stripe Product that groups all hosting subscription items (for
// reporting). Set EB_HOSTING_PRODUCT_ID in prod; otherwise we lazily create
// one per process and memoize it.
let cachedProductId: string | null = process.env.EB_HOSTING_PRODUCT_ID || null;

async function ensureHostingProduct(): Promise<string> {
  if (cachedProductId) return cachedProductId;
  const product = await getStripe().products.create({
    name: "EasyBits Hosting",
    metadata: { eb_kind: "hosting" },
  });
  cachedProductId = product.id;
  return product.id;
}

interface BillingUser {
  stripeId?: string | null;
  stripeIds?: string[];
}

function customerIdOf(user: BillingUser): string | null {
  return user.stripeId || user.stripeIds?.[0] || null;
}

/**
 * Find the user's active platform-plan subscription — the anchor the machine
 * item is attached to. Returns null if the user has no active subscription
 * (i.e. free Byte) → that IS the access gate.
 */
export async function getActivePlanSubscription(
  user: BillingUser
): Promise<Stripe.Subscription | null> {
  const customer = customerIdOf(user);
  if (!customer) return null;
  const subs = await getStripe().subscriptions.list({
    customer,
    status: "active",
    limit: 10,
  });
  if (!subs.data.length) return null;
  // Prefer the subscription that carries the plan metadata; fall back to the
  // first active one (machine items can ride on any active subscription).
  return subs.data.find((s: Stripe.Subscription) => s.metadata?.plan) ?? subs.data[0];
}

/**
 * Append a machine subscription item. `monthlyMxn` is the COMBINED monthly
 * price (tier + disk add-ons). Returns the subscription item id to persist on
 * the Machine row.
 */
export async function addMachineSubscriptionItem(params: {
  subscriptionId: string;
  monthlyMxn: number;
  machineId: string;
  tier: string;
  cpuMode: string;
}): Promise<string> {
  const product = await ensureHostingProduct();
  const item = await getStripe().subscriptionItems.create({
    subscription: params.subscriptionId,
    quantity: 1,
    price_data: {
      currency: "mxn",
      product,
      recurring: { interval: "month" },
      unit_amount: Math.round(params.monthlyMxn * 100), // centavos
    },
    metadata: {
      eb_machine_id: params.machineId,
      eb_tier: params.tier,
      eb_cpu_mode: params.cpuMode,
    },
    proration_behavior: "create_prorations",
  });
  return item.id;
}

/** Re-price an existing machine item (resize / disk change). */
export async function updateMachineSubscriptionItem(
  itemId: string,
  monthlyMxn: number,
  meta?: { tier?: string; cpuMode?: string }
): Promise<void> {
  const product = await ensureHostingProduct();
  await getStripe().subscriptionItems.update(itemId, {
    price_data: {
      currency: "mxn",
      product,
      recurring: { interval: "month" },
      unit_amount: Math.round(monthlyMxn * 100),
    },
    ...(meta && {
      metadata: {
        ...(meta.tier && { eb_tier: meta.tier }),
        ...(meta.cpuMode && { eb_cpu_mode: meta.cpuMode }),
      },
    }),
    proration_behavior: "create_prorations",
  });
}

/** Remove a machine item (on destroy), prorating the unused remainder. */
export async function removeMachineSubscriptionItem(itemId: string): Promise<void> {
  await getStripe().subscriptionItems.del(itemId, {
    proration_behavior: "create_prorations",
  });
}
