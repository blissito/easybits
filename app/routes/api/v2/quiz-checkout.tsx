import { data } from "react-router";
import type { Route } from "./+types/quiz-checkout";
import { getStripe } from "~/.server/stripe";
import { config } from "~/.server/config";
import { CAPABILITIES, ORCHESTRATION_FEE_MXN } from "~/lib/quiz/capabilities";
import { computeQuote } from "~/lib/quiz/pricing";

type QuizCheckoutPayload = {
  selections: string[];
  totalMxn: number;
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

  const { selections, lead, customIntegrations } = payload;
  if (!Array.isArray(selections) || selections.length === 0) {
    return data({ error: "no_selections" }, { status: 400 });
  }
  if (!lead?.email) {
    return data({ error: "missing_lead" }, { status: 400 });
  }

  const validIds = new Set(CAPABILITIES.map((c) => c.id));
  const cleanSelections = selections.filter((s) => validIds.has(s));
  if (cleanSelections.length === 0) {
    return data({ error: "invalid_selections" }, { status: 400 });
  }

  const hasCustomIntegrations = !!customIntegrations;
  const integrationsDesc = customIntegrations?.description?.slice(0, 280) || "";

  const quote = computeQuote(cleanSelections, hasCustomIntegrations);

  const itemsLabel = [
    ...quote.breakdown.map((b) => b.capability.shortLabel),
    ...(hasCustomIntegrations ? ["Integraciones custom*"] : []),
  ].join(" + ");
  const productName = `Agente IA EasyBits — ${itemsLabel}`;
  const productDescription = `Suscripción mensual. Orquestación + soporte humano (${ORCHESTRATION_FEE_MXN} MXN) + ${quote.selectionsCount} capacidades${
    hasCustomIntegrations
      ? " + integraciones custom (estimado preliminar, se ajusta tras llamada)"
      : ""
  }.`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: lead.email,
      metadata: {
        type: "quiz_agent_subscription",
        selections: cleanSelections.join(","),
        custom_integrations: hasCustomIntegrations ? "yes" : "no",
        custom_integrations_desc: integrationsDesc,
        total_mxn: String(quote.totalMxn),
        lead_name: lead.name,
        lead_whatsapp: lead.whatsapp,
        lead_website: lead.website || "",
        lead_business: lead.business || "",
      },
      line_items: [
        {
          price_data: {
            currency: "mxn",
            recurring: { interval: "month" },
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: quote.totalMxn * 100,
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
