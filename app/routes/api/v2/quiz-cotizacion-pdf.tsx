import type { Route } from "./+types/quiz-cotizacion-pdf";
import { withPage } from "~/.server/core/browserPool";
import { CAPABILITIES } from "~/lib/quiz/capabilities";
import { computeQuote, formatMxn } from "~/lib/quiz/pricing";

type LeadInfo = {
  name: string;
  email: string;
  whatsapp: string;
  website?: string;
  business?: string;
  description?: string;
};

type Payload = {
  selections: string[];
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

const DISCOUNT_PCT = 20;

const buildHtml = (payload: Payload, folio: string): string => {
  const { lead, customIntegrations } = payload;
  const validIds = new Set(CAPABILITIES.map((c) => c.id));
  const cleanSelections = payload.selections.filter((s) => validIds.has(s));
  const quote = computeQuote(cleanSelections, !!customIntegrations);
  const discountedTotal = Math.round(
    quote.totalMxn * (1 - DISCOUNT_PCT / 100)
  );
  const savingMxn = quote.totalMxn - discountedTotal;

  const today = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const orchRow = `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">Orquestación + soporte humano</div>
        <div class="cap-incl">Setup inicial · soporte humano · monitoreo y mantenimiento</div>
      </div>
      <div class="cap-price">${formatMxn(quote.orchestrationFeeMxn)}</div>
    </div>`;

  const capRows = quote.breakdown
    .map((line) => {
      const c = line.capability;
      const isFree = line.priceMxn === 0;
      return `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">${escapeHtml(c.shortLabel)} <span class="cap-vendor">(${escapeHtml(c.vendor)})</span></div>
        <div class="cap-incl">${c.includes.map((i) => escapeHtml(i)).join(" · ")}</div>
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

  const customRow = customIntegrations
    ? `
    <div class="cap-row">
      <div class="cap-info">
        <div class="cap-name">Integraciones custom <span class="cap-vendor" style="color:#AA4958">*</span></div>
        ${itemsChips}
        <div class="cap-incl" style="margin-top:${customItems.length > 0 ? "6px" : "0"}">estimado preliminar, se ajusta tras revisar APIs en la llamada</div>
      </div>
      <div class="cap-price">${formatMxn(quote.customIntegrationsMxn)}</div>
    </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cotización EasyBits — ${folio}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #000; background: #FFF; padding: 32px 32px 24px; line-height: 1.4; }
.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid #000; margin-bottom: 24px; }
.brand { font-size: 30px; font-weight: 900; letter-spacing: -0.5px; }
.brand-sub { font-size: 11px; color: rgba(0,0,0,0.6); margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; }
.meta { text-align: right; }
.meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; color: rgba(0,0,0,0.6); }
.meta-folio { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-weight: bold; font-size: 16px; margin: 4px 0; }
.meta-date { font-size: 12px; color: rgba(0,0,0,0.7); }

.lead-block { background: #F3F0F5; border: 2px solid #000; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; }
.lead-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; color: rgba(0,0,0,0.6); margin-bottom: 4px; }
.lead-block .name { font-size: 18px; font-weight: 900; margin-bottom: 2px; }
.lead-block .biz { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.lead-block .contact { font-size: 11px; color: rgba(0,0,0,0.65); }

.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 900; margin-bottom: 12px; padding-left: 4px; }
.cap-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 10px 4px; border-bottom: 1px solid rgba(0,0,0,0.12); page-break-inside: avoid; }
.cap-info { flex: 1; }
.cap-name { font-size: 13px; font-weight: 800; }
.cap-vendor { color: rgba(0,0,0,0.5); font-weight: 500; font-size: 11px; }
.cap-incl { font-size: 10.5px; color: rgba(0,0,0,0.6); margin-top: 3px; line-height: 1.3; }
.custom-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.custom-chip { display: inline-block; padding: 2px 8px; background: #ECD66E; border: 1.5px solid #000; border-radius: 999px; font-size: 10px; font-weight: 700; color: #000; }
.cap-price { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-weight: 900; font-size: 13px; white-space: nowrap; }
.cap-price.free { font-style: italic; color: rgba(0,0,0,0.7); }

.total-row { display: flex; justify-content: space-between; align-items: baseline; padding: 16px 4px 4px; border-top: 3px solid #000; font-weight: 900; margin-top: 8px; }
.total-row .label { font-size: 13px; }
.total-row .amount-original { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 14px; color: rgba(0,0,0,0.4); text-decoration: line-through; font-weight: bold; }
.total-final-row { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px 8px; }
.total-final-row .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 900; color: #9870ED; }
.total-final-row .amount { font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 28px; font-weight: 900; color: #9870ED; }
.savings { font-size: 11px; color: rgba(0,0,0,0.65); padding: 0 4px; margin-top: 2px; font-weight: bold; }
.disclaimer { font-size: 10px; color: rgba(0,0,0,0.5); padding: 0 4px; margin-top: 6px; }

.discount-banner { margin-top: 28px; padding: 22px 26px; border: 3px solid #000; border-radius: 16px; background: #ECD66E; box-shadow: 5px 5px 0 0 #000; text-align: center; page-break-inside: avoid; }
.discount-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 900; color: rgba(0,0,0,0.7); margin-bottom: 10px; }
.discount-headline { font-size: 20px; font-weight: 900; line-height: 1.15; max-width: 480px; margin: 0 auto 8px; }
.discount-subline { font-size: 11px; color: rgba(0,0,0,0.7); margin-top: 8px; }

.footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.15); display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: rgba(0,0,0,0.6); }
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

<div class="section-title">Tu agente IA incluye</div>
${orchRow}
${capRows}
${customRow}

<div class="total-row">
  <div class="label">Total lista (sin descuento)</div>
  <div class="amount-original">${formatMxn(quote.totalMxn)} MXN</div>
</div>
<div class="total-final-row">
  <div class="label">Total con tu descuento</div>
  <div class="amount">${formatMxn(discountedTotal)} MXN/mes</div>
</div>
<div class="savings">Ahorras ${formatMxn(savingMxn)} MXN cada mes al presentar esta cotización · ${DISCOUNT_PCT}% off permanente</div>
<div class="disclaimer">Precios en MXN, no incluyen IVA. Suscripción mensual, cancela cuando quieras.${customIntegrations ? " * Integraciones custom: estimado preliminar, ajustable tras revisar tus APIs en la llamada." : ""}</div>

<div class="discount-banner">
  <div class="discount-tag">★ Descuento permanente ★</div>
  <div class="discount-headline">Presenta esta cotización para recibir 20% DE DESCUENTO PERMANENTE</div>
  <div class="discount-subline">Aplicable al momento de contratar · Folio ${folio}</div>
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
  if (!Array.isArray(payload.selections) || payload.selections.length === 0) {
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
