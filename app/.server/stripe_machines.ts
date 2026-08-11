/**
 * Per-machine billing for the always-on VM hosting product.
 *
 * Model (simplified): ONE Stripe subscription item per machine, appended to
 * the user's existing platform-plan subscription. The item's `unit_amount`
 * already combines the tier price + disk add-ons (see `machineMonthly`), so a
 * resize or a disk change just re-prices the same item. Machines bill on the
 * same invoice cycle as the plan → one invoice, clean UX.
 *
 * SINCE Aug 2026 hosting no longer hangs off the plan. A machine can be bought
 * on its OWN Stripe subscription via Checkout (`createMachineCheckout`), so
 * someone on Free pays $99 for their box instead of $99 + a $299 plan they
 * didn't want. Hosting is its own product line; the plan still gates AI,
 * storage and fleet.
 *
 * Two billing shapes coexist, and `Sandbox` records which one it is:
 *  - `stripeSubItemId`  → legacy/plan-holder: an item on the plan subscription.
 *  - `stripeSubscriptionId` → standalone: the machine IS the subscription.
 * Release must cancel the right one.
 */

import type { Stripe } from "stripe";
import { getStripe } from "./stripe";

// Shared Stripe Product that groups all hosting subscription items (for
// reporting). Set EB_HOSTING_PRODUCT_ID in prod; otherwise we lazily create
// one per process and memoize it.
let cachedProductId: string | null = process.env.EB_HOSTING_PRODUCT_ID || null;

async function ensureHostingProduct(): Promise<string> {
  if (cachedProductId) return cachedProductId;
  // Look before creating. The memo is per-PROCESS, so without this every deploy
  // and every machine restart minted another "EasyBits Hosting" product in
  // Stripe — three of them had already piled up by Aug 2026. Reporting by
  // product becomes meaningless once there are dozens.
  const existing = await getStripe()
    .products.search({ query: `active:'true' AND metadata['eb_kind']:'hosting'`, limit: 1 })
    .catch(() => null);
  if (existing?.data.length) {
    const found = existing.data[0].id;
    cachedProductId = found;
    return found;
  }
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
 * Checkout for a STANDALONE machine subscription — the "hosting without a
 * plan" path. Returns the URL the customer opens to pay.
 *
 * Nothing is provisioned here: the machine is born in the webhook, once Stripe
 * confirms the payment. That way nobody gets free compute, not even for a few
 * minutes, and there is no pending-machine state to reconcile if they abandon
 * the checkout.
 *
 * Everything the webhook needs to build the box travels in `metadata` — it is
 * the only thing Stripe hands back.
 */
export async function createMachineCheckout(params: {
  email?: string | null;
  customerId?: string | null;
  userId: string;
  monthlyMxn: number;
  tier: string;
  cpuMode: string;
  diskAddonsGB: number;
  template?: string;
  name?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const product = await ensureHostingProduct();
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    ...(params.customerId
      ? { customer: params.customerId }
      : params.email
        ? { customer_email: params.email }
        : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "mxn",
          product,
          recurring: { interval: "month" },
          unit_amount: Math.round(params.monthlyMxn * 100),
        },
      },
    ],
    // On the session (read at checkout.session.completed) …
    metadata: {
      eb_machine: "1",
      eb_user_id: params.userId,
      eb_tier: params.tier,
      eb_cpu_mode: params.cpuMode,
      eb_disk_addons: String(params.diskAddonsGB),
      ...(params.template ? { eb_template: params.template } : {}),
      ...(params.name ? { eb_name: params.name } : {}),
    },
    // … and on the subscription itself, so a later cancellation still knows
    // which machine it belongs to.
    subscription_data: {
      metadata: {
        eb_machine: "1",
        eb_user_id: params.userId,
        eb_tier: params.tier,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
  return { url: session.url, sessionId: session.id };
}

/** Cancel a standalone machine subscription (the release path for those). */
export async function cancelMachineSubscription(subscriptionId: string): Promise<void> {
  await getStripe().subscriptions.cancel(subscriptionId, { prorate: true });
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
