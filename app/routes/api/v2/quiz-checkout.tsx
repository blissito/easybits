import { data } from "react-router";
import type { Route } from "./+types/quiz-checkout";
import { getStripe } from "~/.server/stripe";
import { config } from "~/.server/config";
import {
  ANNUAL_DISCOUNT_PCT,
  BABYSIT_MONTHLY_MXN,
  computeAnnualFromMonthly,
  computeQuote,
  computeSetupEffective,
  CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN,
  parseSelections,
  serializeSelections,
  SETUP_BASE_MXN,
} from "~/lib/quiz/pricing";
import { PLANS, effectivePrice, type PlanKey } from "~/lib/plans";

type PlanBilling = "monthly" | "annual";

type QuizCheckoutPayload = {
  selections: string;
  plan?: PlanKey;
  planBilling?: PlanBilling;
  babysit?: boolean;
  customIntegrations: { description: string } | null;
  lead: {
    name: string;
    email: string;
    whatsapp: string;
    website?: string;
    business?: string;
    description?: string;
  } | null;
};

const isPlanKey = (v: unknown): v is PlanKey =>
  v === "Byte" || v === "Mega" || v === "Tera";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "method_not_allowed" }, { status: 405 });
  }

  let payload: QuizCheckoutPayload;
  try {
    payload = await request.json();
  } catch {
    return data({ error: "invalid_json" }, { status: 400 });
  }

  const { selections: selectionsStr, lead, customIntegrations } = payload;
  if (typeof selectionsStr !== "string" || !selectionsStr.trim()) {
    return data({ error: "no_selections" }, { status: 400 });
  }
  if (!lead?.email) {
    return data({ error: "missing_lead" }, { status: 400 });
  }

  const selectionsMap = parseSelections(selectionsStr);
  if (selectionsMap.size === 0) {
    return data({ error: "invalid_selections" }, { status: 400 });
  }

  const hasCustomIntegrations = !!customIntegrations;
  const integrationsDesc = customIntegrations?.description?.slice(0, 280) || "";

  // Solo lo usamos para enriquecer metadata (capabilities seleccionadas).
  // Setup ya no escala con el quote.
  const quote = computeQuote(selectionsMap, hasCustomIntegrations);

  const planKey: PlanKey = isPlanKey(payload.plan) ? payload.plan : "Mega";
  const plan = PLANS[planKey];
  // Byte (gratis) no soporta anual — se cae a monthly siempre.
  const planBilling: PlanBilling =
    planKey !== "Byte" && payload.planBilling === "annual"
      ? "annual"
      : "monthly";
  const babysit = !!payload.babysit;

  const itemsLabel = quote.breakdown
    .map((b) =>
      b.tierLabel
        ? `${b.capability.shortLabel} (${b.tierLabel})`
        : b.capability.shortLabel
    )
    .concat(hasCustomIntegrations ? ["Integraciones custom*"] : [])
    .join(" + ");

  const setupEffectiveMxn = computeSetupEffective(
    quote.capsTotalMxn,
    hasCustomIntegrations
  );
  const setupName = "Setup único — armado del agente";
  const setupDescription = `Pago una sola vez. Setup técnico + personalización total: configuración del agente, MCPs conectados, 2 integraciones simples, hosting; tu marca, prompts custom para tu vertical, capacidades armadas (${itemsLabel || "ninguna"}), 30 días de acompañamiento por WhatsApp y onboarding con tu equipo.${hasCustomIntegrations ? ` Incluye integraciones custom (+${CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN.toLocaleString("es-MX")} MXN al setup).` : ""}`;

  // Line items:
  // - Setup: siempre, one-time. Sube +$10K si trae integraciones custom.
  // - Plan: si Mega/Tera, recurring (mensual o anual con descuento natural)
  // - Babysit: ya no se cobra aparte — viene incluido con el setup.
  const lineItems: Array<{
    price_data: {
      currency: "mxn";
      recurring?: { interval: "month" | "year" };
      product_data: { name: string; description?: string };
      unit_amount: number;
    };
    quantity: number;
  }> = [
    {
      price_data: {
        currency: "mxn",
        product_data: { name: setupName, description: setupDescription },
        unit_amount: setupEffectiveMxn * 100,
      },
      quantity: 1,
    },
  ];

  let planChargedMxn = 0;
  if (planKey !== "Byte") {
    // Effective price (promo if active) — NOT plan.price (the struck list price).
    // Otherwise this checkout would charge Mega at $499 instead of the $299 promo.
    const monthly = effectivePrice(planKey);
    if (planBilling === "annual") {
      planChargedMxn = computeAnnualFromMonthly(monthly);
      lineItems.push({
        price_data: {
          currency: "mxn",
          recurring: { interval: "year" },
          product_data: {
            name: `Plan ${plan.name} — anual (créditos)`,
            description: `${plan.aiGenerationsPerMonth} créditos/mes incluidos · ${ANNUAL_DISCOUNT_PCT}% off por pago anual.`,
          },
          unit_amount: planChargedMxn * 100,
        },
        quantity: 1,
      });
    } else {
      planChargedMxn = monthly;
      lineItems.push({
        price_data: {
          currency: "mxn",
          recurring: { interval: "month" },
          product_data: {
            name: `Plan ${plan.name} — mensual (créditos)`,
            description: `${plan.aiGenerationsPerMonth} créditos/mes incluidos. Cancela cuando quieras.`,
          },
          unit_amount: monthly * 100,
        },
        quantity: 1,
      });
    }
  }

  // Babysit ya no se cobra: viene incluido con el setup. La constante
  // BABYSIT_MONTHLY_MXN sigue importada para retrocompatibilidad de metadata
  // pero no se agrega como line item.

  // Mode: subscription si hay algo recurring (plan no-Byte). Si solo hay
  // setup (Byte sin plan recurring) → mode payment one-time.
  const hasRecurring = lineItems.some((li) => li.price_data.recurring);
  const mode = hasRecurring ? "subscription" : "payment";

  try {
    const session = await getStripe().checkout.sessions.create({
      mode,
      customer_email: lead.email,
      metadata: {
        type: "quiz_agent_v3",
        plan: planKey,
        plan_billing: planBilling,
        babysit: babysit ? "yes" : "no",
        setup_mxn: String(setupEffectiveMxn),
        setup_base_mxn: String(SETUP_BASE_MXN),
        setup_caps_mxn: String(quote.capsTotalMxn),
        custom_integrations_setup_bump_mxn: hasCustomIntegrations
          ? String(CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN)
          : "0",
        plan_charged_mxn: String(planChargedMxn),
        babysit_mxn: babysit ? String(BABYSIT_MONTHLY_MXN) : "0",
        selections: serializeSelections(selectionsMap),
        custom_integrations: hasCustomIntegrations ? "yes" : "no",
        custom_integrations_desc: integrationsDesc,
        lead_name: lead.name,
        lead_whatsapp: lead.whatsapp,
        lead_website: lead.website || "",
        lead_business: lead.business || "",
      },
      line_items: lineItems,
      success_url: `${config.baseUrl}/cuanto-cuesta-mi-agente?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/cuanto-cuesta-mi-agente?cancelled=1`,
    });

    return data({ url: session.url });
  } catch (err) {
    return data(
      {
        error: "stripe_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
};
