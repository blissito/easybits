import { data } from "react-router";
import type { Route } from "./+types/sandbox-reservations";
import { getUserOrRedirect } from "~/.server/getters";
import { getUserPlan, isPaidPlan, type PlanKey } from "~/lib/plans";
import { resolveTier } from "~/lib/hostingCatalog";
import { createSandboxReservationCheckout } from "~/.server/stripe";
import { agentsForMemory } from "~/.server/core/sandboxReservations";

const PLAN_RANK: Record<PlanKey, number> = { Byte: 0, Mega: 1, Tera: 2 };

/**
 * Create a Stripe Checkout session to RESERVE pool capacity for a tier.
 * Returns `{ url }` to redirect to; provisioning is the webhook's job after
 * payment succeeds. NO sandbox is created here (purchase-first, not create-first).
 */
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const { tier: tierKey } = (await request.json().catch(() => ({}))) as { tier?: string };

  const tier = resolveTier(String(tierKey ?? ""));
  if (!tier) return data({ error: `Tier desconocido: "${tierKey}".` }, { status: 400 });

  const plan = getUserPlan(user);
  if (!isPaidPlan(plan)) {
    return data(
      { error: "Necesitas un plan de pago (Mega o Tera) para reservar capacidad." },
      { status: 403 },
    );
  }
  if (PLAN_RANK[plan] < PLAN_RANK[tier.minPlan]) {
    return data(
      { error: `El tier "${tier.key}" requiere el plan ${tier.minPlan} o superior.` },
      { status: 403 },
    );
  }

  const agents = agentsForMemory(tier.memoryMb);
  const url = await createSandboxReservationCheckout({
    userId: user.id,
    email: user.email,
    tier: tier.key,
    label: tier.key,
    priceMxn: tier.priceShared,
    agents,
  });
  return data({ url });
}
