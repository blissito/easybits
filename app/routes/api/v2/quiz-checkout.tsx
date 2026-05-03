import { data } from "react-router";
import type { Route } from "./+types/quiz-checkout";
import { getStripe } from "~/.server/stripe";
import { config } from "~/.server/config";
import {
  ANNUAL_DISCOUNT_PCT,
  BABYSIT_MONTHLY_MXN,
  computeAnnualFromMonthly,
  computeQuote,
  parseSelections,
  serializeSelections,
  SETUP_FLAT_MXN,
} from "~/lib/quiz/pricing";
import { PLANS, type PlanKey } from "~/lib/plans";

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

  const setupName = "Setup único — armado del agente";
  const setupDescription = `Pago una sola vez. Setup técnico + personalización total: configuración del agente, MCPs conectados, 2 integraciones simples, hosting; tu marca, prompts custom para tu vertical, capacidades armadas (${itemsLabel || "ninguna"}), 30 días pair WA y onboarding con tu equipo.${hasCustomIntegrations ? " Integraciones complejas se cotizan en discovery sin costo extra." : ""}`;

  // Line items:
  // - Setup: siempre, one-time, $59K flat
  // - Plan: si Mega/Tera, recurring (mensual o anual con descuento natural)
  // - Babysit: si opt-in, recurring mensual
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
        unit_amount: SETUP_FLAT_MXN * 100,
      },
      quantity: 1,
    },
  ];

  let planChargedMxn = 0;
  if (planKey !== "Byte") {
    const monthly = plan.price;
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

  if (babysit) {
    lineItems.push({
      price_data: {
        currency: "mxn",
        recurring: { interval: "month" },
        product_data: {
          name: "Babysit del agente",
          description:
            "Humano que vigila el agente, ajusta prompts y te responde por WhatsApp. Soporte real, no chatbot.",
        },
        unit_amount: BABYSIT_MONTHLY_MXN * 100,
      },
      quantity: 1,
    });
  }

  // Mode: subscription si hay algo recurring (plan no-Byte o babysit). Si solo
  // hay setup (Byte sin babysit) → mode payment one-time.
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
        setup_mxn: String(SETUP_FLAT_MXN),
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
