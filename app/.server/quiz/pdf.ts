import { withPage } from "~/.server/core/browserPool";
import { QUIZ_WHATSAPP_DISPLAY } from "~/lib/quiz/contact";
import {
  ANNUAL_DISCOUNT_PCT,
  computeAnnualFromMonthly,
  computeQuote,
  computeSetupEffective,
  CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN,
  formatMxn,
  formatUsd,
  parseSelections,
  SETUP_BASE_MXN,
  type BillingMode,
} from "~/lib/quiz/pricing";
import { PLANS, type PlanKey } from "~/lib/plans";

export type QuizPdfLead = {
  name: string;
  email: string;
  whatsapp: string;
  website?: string;
  business?: string;
  description?: string;
};

export type QuizPdfPayload = {
  // Formato "voice:pro,images,whatsapp"
  selections: string;
  customIntegrations: { description: string; items?: string[] } | null;
  // Plan de créditos elegido en el stepper. Default Mega si no se manda.
  plan?: PlanKey;
  // Mensual vs anual del plan. Solo aplica para Mega/Tera. Acepta ambos
  // nombres por compat: el cliente manda `planBilling`, el contrato viejo de
  // emails/sendQuizQuotation usa `billingMode`.
  planBilling?: BillingMode;
  billingMode?: BillingMode;
  lead: QuizPdfLead;
};

export const generateQuizFolio = (): string => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EBQ-${yyyy}-${mm}-${random}`;
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildQuizPdfHtml = (
  payload: QuizPdfPayload,
  folio: string
): string => {
  const { lead, customIntegrations } = payload;
  const selectionsMap = parseSelections(payload.selections || "");
  const hasCustomIntegrations = !!customIntegrations;
  const quote = computeQuote(selectionsMap, hasCustomIntegrations);

  // Plan de créditos — el modelo nuevo. El plan es la suscripción mensual,
  // las capabilities ya están armadas en el setup.
  const planKey: PlanKey = (payload.plan as PlanKey) || "Mega";
  const plan = PLANS[planKey];
  const planSupportsAnnual = planKey !== "Byte" && plan.price > 0;
  const billingMode = payload.planBilling ?? payload.billingMode;
  const isAnnual = planSupportsAnnual && billingMode === "annual";
  const planMonthly = plan.price;
  const planAnnualTotal = planSupportsAnnual
    ? computeAnnualFromMonthly(planMonthly)
    : 0;
  const setupEffectiveMxn = computeSetupEffective(
    quote.capsTotalMxn,
    hasCustomIntegrations
  );
  const setupUsdEffective = Math.round(setupEffectiveMxn / 17 / 100) * 100;

  const today = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Capabilities listadas como "incluidas en el setup" — sin precio por línea.
  const capRows = quote.breakdown
    .map((line) => {
      const c = line.capability;
      const tierBadge = line.tierLabel
        ? ` <span class="tier-badge">${escapeHtml(line.tierLabel)}</span>`
        : "";
      return `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">${escapeHtml(c.shortLabel)}${tierBadge} <span class="cap-vendor">(${escapeHtml(c.vendor)})</span></div>
        <div class="cap-incl">${c.includes.map((i) => escapeHtml(i)).join(" · ")}</div>
      </div>
      <div class="cap-price free">Incluido</div>
    </div>`;
    })
    .join("");

  const customItems =
    customIntegrations?.items && customIntegrations.items.length > 0
      ? customIntegrations.items
      : customIntegrations?.description
        ? customIntegrations.description.split(" · ").filter(Boolean)
        : [];

  const itemsChips =
    customItems.length > 0
      ? `<div class="custom-chips">${customItems
          .map(
            (it) => `<span class="custom-chip">${escapeHtml(it)}</span>`
          )
          .join("")}</div>`
      : "";

  const customSection = customIntegrations
    ? `
  <div class="custom-section">
    <div class="custom-tag">🔌 Integraciones custom incluidas en el setup</div>
    ${itemsChips}
    <div class="custom-note-inline">Suben +${formatMxn(CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN)} al setup único. Las complejas (SAP/ERP, sync continuo) las scopeamos en la primera reunión sin discovery extra.</div>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cotización EasyBits — ${folio}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #000; background: #FFF; padding: 28px 32px 24px; line-height: 1.4; }
.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid #000; margin-bottom: 20px; }
.brand { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
.brand-sub { font-size: 11px; color: rgba(0,0,0,0.6); margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; }
.meta { text-align: right; }
.meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; color: rgba(0,0,0,0.6); }
.meta-folio { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-weight: bold; font-size: 15px; margin: 4px 0; }
.meta-date { font-size: 11px; color: rgba(0,0,0,0.7); }

.lead-block { background: #F3F0F5; border: 2px solid #000; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; }
.lead-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; color: rgba(0,0,0,0.6); margin-bottom: 4px; }
.lead-block .name { font-size: 17px; font-weight: 900; margin-bottom: 2px; }
.lead-block .biz { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.lead-block .contact { font-size: 11px; color: rgba(0,0,0,0.65); }

/* SETUP one-time block — anchor of the model */
.setup-block { background: #000; color: #FFF; border: 3px solid #000; border-radius: 14px; padding: 18px 22px; margin-bottom: 18px; box-shadow: 5px 5px 0 0 rgba(0,0,0,1); page-break-inside: avoid; }
.setup-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 2.5px; font-weight: 900; color: #ECD66E; margin-bottom: 6px; }
.setup-amount-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.setup-amount { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 32px; font-weight: 900; }
.setup-currency { font-size: 12px; font-weight: 700; opacity: 0.6; }
.setup-mxn { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 11px; opacity: 0.5; }
.setup-list { font-size: 11px; line-height: 1.55; padding-left: 18px; opacity: 0.9; }
.setup-list li { margin-bottom: 2px; }
.setup-disclaimer { font-size: 10px; opacity: 0.5; margin-top: 10px; line-height: 1.4; }

.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 900; margin: 14px 0 10px; padding-left: 4px; }
.cap-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 9px 4px; border-bottom: 1px solid rgba(0,0,0,0.12); page-break-inside: avoid; }
.cap-info { flex: 1; }
.cap-name { font-size: 13px; font-weight: 800; }
.cap-vendor { color: rgba(0,0,0,0.5); font-weight: 500; font-size: 11px; }
.tier-badge { display: inline-block; padding: 1px 6px; background: #000; color: #FFF; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-radius: 3px; vertical-align: middle; margin-left: 2px; }
.cap-incl { font-size: 10.5px; color: rgba(0,0,0,0.6); margin-top: 3px; line-height: 1.3; }
.cap-meta { font-size: 10px; color: rgba(0,0,0,0.75); margin-top: 4px; padding: 4px 8px; background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; line-height: 1.3; }
.cap-human { font-size: 11px; font-weight: 800; color: #000; margin-bottom: 2px; }
.cap-tech { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 9.5px; color: rgba(0,0,0,0.6); }
.cap-meta strong { color: #000; }
.cap-price { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-weight: 900; font-size: 13px; white-space: nowrap; }
.cap-price.free { font-style: italic; color: rgba(0,0,0,0.7); }

.total-row { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 4px 4px; border-top: 3px solid #000; font-weight: 900; margin-top: 6px; }
.total-row .label { font-size: 13px; }
.total-row .amount-original { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 13px; color: rgba(0,0,0,0.4); text-decoration: line-through; font-weight: bold; }
.total-final-row { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px 6px; }
.total-final-row .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 900; color: #9870ED; }
.total-final-row .amount { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 26px; font-weight: 900; color: #9870ED; }
.savings { font-size: 11px; color: rgba(0,0,0,0.65); padding: 0 4px; margin-top: 2px; font-weight: bold; }
.disclaimer { font-size: 10px; color: rgba(0,0,0,0.5); padding: 0 4px; margin-top: 6px; }

.custom-section { margin-top: 14px; padding: 10px 14px; border: 2px solid #000; border-radius: 10px; background: #FAFAFA; page-break-inside: avoid; }
.custom-tag { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 900; color: rgba(0,0,0,0.7); margin-bottom: 6px; }
.custom-note-inline { font-size: 10px; color: rgba(0,0,0,0.65); line-height: 1.4; }
.custom-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.custom-chip { display: inline-block; padding: 2px 8px; background: #ECD66E; border: 1.5px solid #000; border-radius: 999px; font-size: 10px; font-weight: 700; color: #000; }

.commitment-block { margin-top: 18px; padding: 14px 18px; border: 2px solid #000; border-radius: 10px; background: #FFF; page-break-inside: avoid; }
.commitment-tag { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; font-weight: 900; color: rgba(0,0,0,0.6); margin-bottom: 5px; }
.commitment-text { font-size: 11.5px; color: #000; line-height: 1.45; }

.discount-banner { margin-top: 18px; padding: 18px 22px; border: 3px solid #000; border-radius: 14px; background: #ECD66E; box-shadow: 5px 5px 0 0 #000; text-align: center; page-break-inside: avoid; }
.discount-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 900; color: rgba(0,0,0,0.7); margin-bottom: 8px; }
.discount-headline { font-size: 17px; font-weight: 900; line-height: 1.2; max-width: 480px; margin: 0 auto 6px; }
.discount-subline { font-size: 11px; color: rgba(0,0,0,0.7); margin-top: 6px; }

.footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.15); display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: rgba(0,0,0,0.6); }
.footer .url { font-weight: bold; color: #000; }
</style>
</head>
<body>

<div class="header">
  <img src="https://www.easybits.cloud/logo.png" alt="Easybits" style="height:48px;width:auto;display:block;" />
  <div class="meta">
    <div class="meta-label">Cotización</div>
    <div class="meta-folio">${folio}</div>
    <div class="meta-date">${today}</div>
  </div>
</div>

<div class="lead-block">
  <div class="label">Para</div>
  <div class="name">${escapeHtml(lead.name)}</div>
  ${lead.business ? `<div class="biz">${escapeHtml(lead.business)}</div>` : ""}
  <div class="contact">${escapeHtml(lead.email)} · ${escapeHtml(lead.whatsapp)}${lead.website ? ` · ${escapeHtml(lead.website)}` : ""}</div>
</div>

<div class="setup-block">
  <div class="setup-tag">★ Setup único · pago una sola vez ★</div>
  <div class="setup-amount-row">
    <div class="setup-amount">${formatMxn(setupEffectiveMxn)}</div>
    <div class="setup-currency">MXN</div>
    <div class="setup-mxn">≈ ${formatUsd(setupUsdEffective)} USD</div>
  </div>
  ${
    quote.capsTotalMxn > 0 || hasCustomIntegrations
      ? `<div class="setup-mxn" style="margin-top:-4px;margin-bottom:8px;">${formatMxn(SETUP_BASE_MXN)} base${quote.capsTotalMxn > 0 ? ` + ${formatMxn(quote.capsTotalMxn)} capacidades` : ""}${hasCustomIntegrations ? ` + ${formatMxn(CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN)} integraciones custom` : ""}</div>`
      : ""
  }
  <div style="font-size:13px;font-weight:900;color:#FFF;margin:8px 0 4px;line-height:1.3;">Tu agente nace con tu marca, tu voz y tu manera.</div>
  <div style="font-size:11px;color:rgba(255,255,255,0.78);line-height:1.5;margin-bottom:8px;">Dos expertos en robots lo arman pieza por pieza: modelo, prompts, MCPs, integraciones y branding. Babysit del agente, 30 días acompañándote por WhatsApp y onboarding con tu equipo — todo incluido. Cuando arranca, ya queda funcionando y listo para producción.</div>
  <ul class="setup-list">
    <li>Modelos Claude/Gemini configurados</li>
    <li>MCPs conectados a tus DBs/APIs</li>
    <li>Prompts custom para tu vertical</li>
    <li>Tu logo, colores y tono</li>
    <li>2 integraciones simples</li>
    <li>Hosting 24/7 + babysit del agente</li>
  </ul>
  <div class="setup-disclaimer">✓ Hablamos por WhatsApp antes de cobrar · si no encajamos, no hay deal · setup no reembolsable una vez iniciado el armado. Setup + primera mensualidad se cobran juntos vía Stripe.</div>
</div>

<div class="section-title">Plan de créditos · ${escapeHtml(plan.name)}</div>
<div class="cap-row" style="border-bottom:none;padding-bottom:4px;">
  <div class="cap-info">
    <div class="cap-name">${escapeHtml(plan.name)} <span class="cap-vendor">(${plan.aiGenerationsPerMonth ?? "∞"} créditos/mes)</span></div>
    <div class="cap-incl">${plan.features.slice(0, 4).map((f) => escapeHtml(f)).join(" · ")}</div>
  </div>
  <div class="cap-price">${
    planMonthly === 0
      ? "Gratis"
      : isAnnual
        ? `${formatMxn(planAnnualTotal)}/año`
        : `${formatMxn(planMonthly)}/mes`
  }</div>
</div>
${
  isAnnual
    ? `<div class="disclaimer" style="margin-top:4px;">≈ ${formatMxn(Math.round(planAnnualTotal / 12))}/mes pagado anualmente · ${ANNUAL_DISCOUNT_PCT}% off vs mensual.</div>`
    : ""
}
<div class="disclaimer" style="margin-bottom:14px;">1 crédito = 1 documento profesional · 6 cr = 1 reel avatar · 8 cr = 1 min voz clonada. Recargas desde $39 MXN — packs sin caducidad.</div>

<div class="section-title">Lo que tu agente hace · incluido en el setup</div>
${capRows}

${customSection}

<div class="footer">
  <div class="url">www.easybits.cloud / cuanto-cuesta-mi-agente</div>
  <div>WhatsApp · ${QUIZ_WHATSAPP_DISPLAY}</div>
</div>

</body>
</html>`;
};

export const renderQuizPdf = async (
  payload: QuizPdfPayload,
  folio: string
): Promise<Buffer> => {
  const html = buildQuizPdfHtml(payload, folio);
  return await withPage(async (page) => {
    // Cambiamos a `load` porque ahora el header carga el logo desde
    // www.easybits.cloud/logo.png — domcontentloaded no esperaría la imagen
    // y saldría rota en el PDF.
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  });
};
