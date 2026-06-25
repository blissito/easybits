import { data } from "react-router";
import type { Route } from "./+types/sandbox-reservations";
import { getUserOrRedirect } from "~/.server/getters";
import { getUserPlan, isPaidPlan } from "~/lib/plans";
import { POOL_BOX } from "~/lib/hostingCatalog";
import { createSandboxReservationCheckout } from "~/.server/stripe";

/**
 * Create a Stripe Checkout session to RESERVE pool capacity.
 *
 * The pool is flat: capacity is bought in identical boxes (see POOL_BOX). The
 * client sends how many boxes (`quantity`); we bill that many and grant
 * `4 × quantity` agent slots. Returns `{ url }` to redirect to; provisioning is
 * the webhook's job after payment succeeds (purchase-first, not create-first).
 */
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const body = (await request.json().catch(() => ({}))) as { quantity?: number };

  const quantity = Math.min(50, Math.max(1, Math.round(Number(body.quantity) || 1)));

  const plan = getUserPlan(user);
  if (!isPaidPlan(plan)) {
    return data(
      { error: "Necesitas un plan de pago (Mega o Tera) para reservar capacidad." },
      { status: 403 },
    );
  }

  const agents = POOL_BOX.agents * quantity;
  const url = await createSandboxReservationCheckout({
    userId: user.id,
    email: user.email,
    tier: POOL_BOX.key,
    quantity,
    priceMxn: POOL_BOX.priceMxn,
    agents,
  });
  return data({ url });
}
