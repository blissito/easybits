import { data } from "react-router";
import type { Route } from "./+types/quiz-checkout";
import { getStripe } from "~/.server/stripe";
import { config } from "~/.server/config";
import {
  FIT_GUARANTEE_DAYS,
  ORCHESTRATION_FEE_MXN,
  SETUP_FEE_MXN,
} from "~/lib/quiz/capabilities";
import {
  computeDiscountedMonthly,
  computeQuote,
  parseSelections,
  QUOTE_DISCOUNT_PCT,
  serializeSelections,
} from "~/lib/quiz/pricing";

type QuizCheckoutPayload = {
  // Formato "voice:pro,images,whatsapp" — string serializado por serializeSelections.
  selections: string;
  monthlyTotalMxn: number;
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

  const quote = computeQuote(selectionsMap, hasCustomIntegrations);
  const discountedMonthlyMxn = computeDiscountedMonthly(quote.monthlyTotalMxn);

  const itemsLabel = [
    ...quote.breakdown.map((b) =>
      b.tierLabel
        ? `${b.capability.shortLabel} (${b.tierLabel})`
        : b.capability.shortLabel
    ),
    ...(hasCustomIntegrations ? ["Integraciones custom*"] : []),
  ].join(" + ");
  const monthlyName = `Mensualidad agente IA — ${itemsLabel}`;
  const monthlyDescription = `Recurrente mensual con ${QUOTE_DISCOUNT_PCT}% off permanente aplicado: operación + babysit (${ORCHESTRATION_FEE_MXN} MXN lista) + ${quote.selectionsCount} capacidades${
    hasCustomIntegrations
      ? ". Integraciones custom: discovery + desarrollo cotizado aparte."
      : "."
  }`;
  const setupName = "Setup único — armado del agente";
  const setupDescription = `Pago una sola vez. Incluye: 30 días pair WA con dos seniors, setup técnico + MCPs + tu marca, 2 integraciones simples. ${FIT_GUARANTEE_DAYS} días de fit guarantee — refund 100% si no encajamos.`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: lead.email,
      metadata: {
        type: "quiz_agent_full_combo",
        selections: serializeSelections(selectionsMap),
        custom_integrations: hasCustomIntegrations ? "yes" : "no",
        custom_integrations_desc: integrationsDesc,
        monthly_list_mxn: String(quote.monthlyTotalMxn),
        monthly_charged_mxn: String(discountedMonthlyMxn),
        discount_pct: String(QUOTE_DISCOUNT_PCT),
        setup_mxn: String(SETUP_FEE_MXN),
        fit_guarantee_days: String(FIT_GUARANTEE_DAYS),
        lead_name: lead.name,
        lead_whatsapp: lead.whatsapp,
        lead_website: lead.website || "",
        lead_business: lead.business || "",
      },
      line_items: [
        {
          // Mensualidad recurrente (con 20% off ya aplicado)
          price_data: {
            currency: "mxn",
            recurring: { interval: "month" },
            product_data: {
              name: monthlyName,
              description: monthlyDescription,
            },
            unit_amount: discountedMonthlyMxn * 100,
          },
          quantity: 1,
        },
        {
          // Setup único — se carga en la PRIMERA factura junto con el primer mes.
          // Stripe permite mezclar one-time + recurring en mode: "subscription".
          price_data: {
            currency: "mxn",
            product_data: {
              name: setupName,
              description: setupDescription,
            },
            unit_amount: SETUP_FEE_MXN * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${config.baseUrl}/cuanto-cuesta-mi-agente?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/cuanto-cuesta-mi-agente?cancelled=1`,
      allow_promotion_codes: true,
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
