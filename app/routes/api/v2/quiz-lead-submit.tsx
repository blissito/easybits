import { data } from "react-router";
import type { Route } from "./+types/quiz-lead-submit";
import { sendQuizQuotation } from "~/.server/emails/sendQuizQuotation";
import { parseSelections, type BillingMode } from "~/lib/quiz/pricing";

const QUIZ_FORM_ID = "69efd203ad74435521a74b34";

type Payload = {
  // Lead fields
  name: string;
  email: string;
  whatsapp: string;
  website?: string;
  // Quote context
  selections: string;
  integrations: string; // human-readable description ("yes — HubSpot, Mercado Libre" or "no")
  monthly_mxn: string;
  setup_mxn: string;
  // Default monthly. annual sólo si selectionsCount >= 3.
  billingMode?: BillingMode;
  // Custom integrations payload (parsed for the PDF)
  customIntegrations: { description: string; items?: string[] } | null;
};

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "method_not_allowed" }, { status: 405 });
  }

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return data({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload.email || !payload.name || !payload.whatsapp) {
    return data({ error: "missing_lead" }, { status: 400 });
  }
  if (
    typeof payload.selections !== "string" ||
    !payload.selections.trim()
  ) {
    return data({ error: "no_selections" }, { status: 400 });
  }

  const selectionsMap = parseSelections(payload.selections);
  if (selectionsMap.size === 0) {
    return data({ error: "invalid_selections" }, { status: 400 });
  }

  // Save lead to existing forms collection (kept as source of truth for leads).
  // Use absolute URL so the fetch works in server runtime.
  const origin = new URL(request.url).origin;
  let formSubmitOk = true;
  try {
    const formRes = await fetch(`${origin}/api/v2/forms/${QUIZ_FORM_ID}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        whatsapp: payload.whatsapp,
        website: payload.website || "",
        selections: payload.selections,
        integrations: payload.integrations,
        monthly_mxn: payload.monthly_mxn,
        setup_mxn: payload.setup_mxn,
      }),
    });
    formSubmitOk = formRes.ok;
  } catch (err) {
    console.error("[quiz-lead-submit] forms/submit error", err);
    formSubmitOk = false;
  }

  // Send quotation email with PDF attached. Don't await `getSesTransport()` to fail
  // the whole request if email is misconfigured — log the error and report it,
  // but keep the lead capture as the source of truth.
  const result = await sendQuizQuotation({
    payload: {
      selections: payload.selections,
      customIntegrations: payload.customIntegrations,
      billingMode: payload.billingMode,
      lead: {
        name: payload.name,
        email: payload.email,
        whatsapp: payload.whatsapp,
        website: payload.website || "",
      },
    },
  });

  return data({
    ok: true,
    formSubmitOk,
    emailSent: result.ok,
    emailError: result.ok ? undefined : result.error,
    folio: result.folio,
  });
};
