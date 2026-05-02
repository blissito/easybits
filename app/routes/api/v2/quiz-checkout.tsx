import { data } from "react-router";
import type { Route } from "./+types/quiz-checkout";
import { getStripe } from "~/.server/stripe";
import { config } from "~/.server/config";
import { ORCHESTRATION_FEE_MXN } from "~/lib/quiz/capabilities";
import {
  computeAnnualPlan,
  computeDiscountedMonthly,
  computeQuote,
  isAnnualPlanEligible,
  parseSelections,
  QUOTE_DISCOUNT_PCT,
  serializeSelections,
  type BillingMode,
} from "~/lib/quiz/pricing";

type QuizCheckoutPayload = {
  // Formato "voice:pro,images,whatsapp" — string serializado por serializeSelections.
  selections: string;
  monthlyTotalMxn: number;
  customIntegrations: { description: string } | null;
  // Default monthly. annual solo válido si selectionsCount >= 3.
  billingMode?: BillingMode;
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

  // Resolver billing mode con guardrails: annual solo si payload pidió anual
  // Y el usuario tiene 3+ capacidades. Si no es elegible, caemos a monthly
  // sin error — es una salvaguarda contra clientes que manipulen la URL.
  const requestedAnnual = payload.billingMode === "annual";
  const annualEligible = isAnnualPlanEligible(quote.selectionsCount);
  const effectiveBillingMode: BillingMode =
    requestedAnnual && annualEligible ? "annual" : "monthly";
  const annualPlan = computeAnnualPlan(
    quote.monthlyTotalMxn,
    quote.setupOneTimeMxn,
    quote.selectionsCount
  );

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
  const annualName = `Plan anual agente IA — ${itemsLabel}`;
  const annualDescription = `Cobro anual: 12 meses con ${QUOTE_DISCOUNT_PCT}% off permanente. Setup único INCLUIDO sin costo (ahorras ${quote.setupOneTimeMxn} MXN). Renueva automáticamente al precio anual.`;
  const setupName = "Setup único — armado del agente";
  const setupDescription = `Pago una sola vez. Incluye: 30 días pair WA con dos seniors, setup técnico + MCPs + tu marca, 2 integraciones simples. Validamos fit por WhatsApp antes del cobro: si no encajamos, no hay deal.`;

  // Construye line items según modo. Annual: 1 line item recurring yearly,
  // sin setup. Monthly: mensualidad recurrente + setup one-time.
  const lineItems =
    effectiveBillingMode === "annual"
      ? [
          {
            price_data: {
              currency: "mxn" as const,
              recurring: { interval: "year" as const },
              product_data: {
                name: annualName,
                description: annualDescription,
              },
              unit_amount: annualPlan.totalAnnualMxn * 100,
            },
            quantity: 1,
          },
        ]
      : [
          {
            // Mensualidad recurrente (con 20% off ya aplicado)
            price_data: {
              currency: "mxn" as const,
              recurring: { interval: "month" as const },
              product_data: {
                name: monthlyName,
                description: monthlyDescription,
              },
              unit_amount: discountedMonthlyMxn * 100,
            },
            quantity: 1,
          },
          {
            // Setup único (escalado según selecciones) — se carga en la PRIMERA
            // factura junto con el primer mes. Stripe permite mezclar one-time +
            // recurring en mode: "subscription".
            price_data: {
              currency: "mxn" as const,
              product_data: {
                name: setupName,
                description: setupDescription,
              },
              unit_amount: quote.setupOneTimeMxn * 100,
            },
            quantity: 1,
          },
        ];

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: lead.email,
      metadata: {
        type: "quiz_agent_full_combo",
        billing_mode: effectiveBillingMode,
        selections: serializeSelections(selectionsMap),
        custom_integrations: hasCustomIntegrations ? "yes" : "no",
        custom_integrations_desc: integrationsDesc,
        monthly_list_mxn: String(quote.monthlyTotalMxn),
        monthly_charged_mxn: String(discountedMonthlyMxn),
        annual_total_mxn:
          effectiveBillingMode === "annual"
            ? String(annualPlan.totalAnnualMxn)
            : "",
        discount_pct: String(QUOTE_DISCOUNT_PCT),
        setup_mxn:
          effectiveBillingMode === "annual"
            ? "0"
            : String(quote.setupOneTimeMxn),
        setup_waived_mxn:
          effectiveBillingMode === "annual"
            ? String(quote.setupOneTimeMxn)
            : "0",
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
