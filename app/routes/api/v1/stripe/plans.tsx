import { redirect } from "react-router";
import { getStripe } from "~/.server/stripe";
import { PLANS, effectivePrice, type PlanKey } from "~/lib/plans";
import { config } from "~/.server/config";
import type { Route } from "./+types/plans";

const PLAN_BY_INTENT: Record<string, PlanKey> = {
  flow_plan: "Mega",
  studio_plan: "Tera",
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const planKey = PLAN_BY_INTENT[intent];
  if (!planKey) return null;

  const plan = PLANS[planKey];
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    metadata: { plan: planKey },
    subscription_data: { metadata: { plan: planKey } },
    line_items: [
      {
        price_data: {
          currency: "mxn",
          recurring: { interval: "month" },
          product_data: { name: `EasyBits ${plan.name}` },
          // Charge the EFFECTIVE price (promo if active). Mega = $299 promo
          // while plan.price ($499) is only the struck-through list price.
          unit_amount: effectivePrice(planKey) * 100,
        },
        quantity: 1,
      },
    ],
    success_url: `${config.baseUrl}/planes?success=1`,
    cancel_url: `${config.baseUrl}/planes?cancel=1`,
    allow_promotion_codes: true,
  });

  throw redirect(session.url || "/404");
};

export const loader = ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.has("success")) {
    return redirect("/planes");
  }
  return { by: "blissmo", message: "t(*_*t)" };
};
