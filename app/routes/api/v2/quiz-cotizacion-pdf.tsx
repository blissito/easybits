import type { Route } from "./+types/quiz-cotizacion-pdf";
import { withPage } from "~/.server/core/browserPool";
import { FIT_GUARANTEE_DAYS } from "~/lib/quiz/capabilities";
import {
  computeDiscountedMonthly,
  computeQuote,
  formatMxn,
  formatUsd,
  parseSelections,
  QUOTE_DISCOUNT_PCT,
} from "~/lib/quiz/pricing";

type LeadInfo = {
  name: string;
  email: string;
  whatsapp: string;
  website?: string;
  business?: string;
  description?: string;
};

type Payload = {
  // Formato "voice:pro,images,whatsapp"
  selections: string;
  customIntegrations: { description: string; items?: string[] } | null;
  lead: LeadInfo;
};

const generateFolio = (): string => {
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

const buildHtml = (payload: Payload, folio: string): string => {
  const { lead, customIntegrations } = payload;
  const selectionsMap = parseSelections(payload.selections || "");
  const quote = computeQuote(selectionsMap, !!customIntegrations);
  const discountedMonthly = computeDiscountedMonthly(quote.monthlyTotalMxn);
  const monthlySaving = quote.monthlyTotalMxn - discountedMonthly;

  const today = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const orchRow = `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">Operación + babysit del agente</div>
        <div class="cap-incl">Que el agente no se rompa · ajustes que pidas · soporte humano, no chatbot</div>
      </div>
      <div class="cap-price">${formatMxn(quote.orchestrationFeeMxn)}</div>
    </div>`;

  const capRows = quote.breakdown
    .map((line) => {
      const c = line.capability;
      const isFree = line.priceMxn === 0;
      const capRow = line.cap
        ? `<div class="cap-meta">${line.humanLine ? `<div class="cap-human">${escapeHtml(line.humanLine)}</div>` : ""}<span class="cap-tech">${escapeHtml(line.cap.included)} ${escapeHtml(line.cap.unit)} · exceso: ${escapeHtml(line.cap.overage)}</span></div>`
        : "";
      const tierBadge = line.tierLabel
        ? ` <span class="tier-badge">${escapeHtml(line.tierLabel)}</span>`
        : "";
      return `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">${escapeHtml(c.shortLabel)}${tierBadge} <span class="cap-vendor">(${escapeHtml(c.vendor)})</span></div>
        <div class="cap-incl">${c.includes.map((i) => escapeHtml(i)).join(" · ")}</div>
        ${capRow}
      </div>
      <div class="cap-price ${isFree ? "free" : ""}">${isFree ? "Incluido" : formatMxn(line.priceMxn)}</div>
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
    <div class="custom-tag">🔌 Integraciones que mencionaste</div>
    ${itemsChips}
    <div class="custom-note-inline">Las simples entran en el setup. Las complejas (SAP/ERP, sync continuo) las scopeamos en la primera reunión sin costo extra.</div>
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
  <div>
    <div class="brand">EasyBits</div>
    <div class="brand-sub">Agentes IA para tu negocio</div>
  </div>
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
    <div class="setup-amount">${formatMxn(quote.setupOneTimeMxn)}</div>
    <div class="setup-currency">MXN</div>
    <div class="setup-mxn">≈ ${formatUsd(quote.setupOneTimeUsd)} USD</div>
  </div>
  <ul class="setup-list">
    <li><strong>30 días pair WA con dos seniors</strong> (ventana 9-18h MX, respuesta &lt; 2h)</li>
    <li>Setup técnico + MCPs + tu marca</li>
    <li>2 integraciones simples</li>
  </ul>
  <div class="setup-disclaimer">✓ ${FIT_GUARANTEE_DAYS} días de fit guarantee · refund 100% si no encajamos · después, no reembolsable. Setup + primera mensualidad se cobran juntos vía Stripe.</div>
</div>

<div class="section-title">Mensualidad recurrente</div>
${orchRow}
${capRows}

<div class="total-row">
  <div class="label">Total mensual (lista)</div>
  <div class="amount-original">${formatMxn(quote.monthlyTotalMxn)} MXN</div>
</div>
<div class="total-final-row">
  <div class="label">Total mensual con tu descuento</div>
  <div class="amount">${formatMxn(discountedMonthly)} MXN/mes</div>
</div>
<div class="savings">Ahorras ${formatMxn(monthlySaving)} MXN cada mes al presentar esta cotización · ${QUOTE_DISCOUNT_PCT}% off permanente en mensualidad</div>
<div class="disclaimer">Precios en MXN, no incluyen IVA. Mensualidad recurrente, cancela cuando quieras (el setup nunca se reembolsa). Caps de uso visibles por capability — el exceso se factura aparte.</div>

${customSection}

<div class="commitment-block">
  <div class="commitment-tag">✦ Quiénes te van a atender</div>
  <div class="commitment-text">Tipo <strong>Invincible y Eve</strong>, pero en vez de salvar el mundo te armamos tu agente. Dos haciendo todo: sin call center, sin juniors, sin monstruos de otra dimensión. Si te tomamos, te atendemos nosotros.</div>
</div>

<div class="discount-banner">
  <div class="discount-tag">★ Descuento permanente ★</div>
  <div class="discount-headline">Presenta esta cotización para recibir 20% OFF PERMANENTE en mensualidad</div>
  <div class="discount-subline">Aplicable al contratar · Folio ${folio} · El descuento no aplica al setup único</div>
</div>

<div class="footer">
  <div class="url">www.easybits.cloud / cuanto-cuesta-mi-agente</div>
  <div>WhatsApp · wa.me/527712412825</div>
</div>

</body>
</html>`;
};

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (!payload.lead?.email) {
    return new Response("Missing lead", { status: 400 });
  }
  if (typeof payload.selections !== "string" || !payload.selections.trim()) {
    return new Response("No selections", { status: 400 });
  }

  const folio = generateFolio();
  const html = buildHtml(payload, folio);

  try {
    const pdfBuffer = await withPage(async (page) => {
      // HTML is fully inline (no external assets) — domcontentloaded is enough
      // and skips ~500ms wait that 'networkidle' adds.
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      return await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="EasyBits-Cotizacion-${folio}.pdf"`,
        "X-Quiz-Folio": folio,
      },
    });
  } catch (err) {
    console.error("[quiz-cotizacion-pdf] error", err);
    return new Response(
      `PDF generation failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 500 }
    );
  }
};
