import {
  generateQuizFolio,
  renderQuizPdf,
  type QuizPdfPayload,
} from "~/.server/quiz/pdf";
import { QUIZ_WHATSAPP_NUMBER } from "~/lib/quiz/contact";
import {
  computeAnnualPlan,
  computeDiscountedMonthly,
  computeQuote,
  formatMxn,
  isAnnualPlanEligible,
  parseSelections,
  QUOTE_DISCOUNT_PCT,
} from "~/lib/quiz/pricing";
import { getSesRemitent, getSesTransport } from "./sendgridTransport";

const buildQuotationEmailHtml = (
  payload: QuizPdfPayload,
  folio: string
): string => {
  const { lead } = payload;
  const selectionsMap = parseSelections(payload.selections || "");
  const quote = computeQuote(selectionsMap, !!payload.customIntegrations);
  const discountedMonthly = computeDiscountedMonthly(quote.monthlyTotalMxn);
  const isAnnual =
    payload.billingMode === "annual" &&
    isAnnualPlanEligible(quote.selectionsCount);
  const annualPlan = computeAnnualPlan(
    quote.monthlyTotalMxn,
    quote.setupOneTimeMxn,
    quote.selectionsCount
  );

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Tu cotización EasyBits — ${folio}</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:28px;font-weight:900;margin:0 0 8px;letter-spacing:-0.5px;">EasyBits</h1>
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(0,0,0,0.6);font-weight:bold;margin:0 0 24px;">Cotización · ${folio}</p>

    <div style="background:#FFF;border:3px solid #000;border-radius:14px;padding:24px;box-shadow:5px 5px 0 0 rgba(0,0,0,1);">
      <h2 style="font-size:22px;font-weight:900;margin:0 0 12px;line-height:1.2;">¡Listo, ${lead.name.split(" ")[0]}! Aquí va tu cotización.</h2>
      <p style="font-size:14px;line-height:1.5;color:rgba(0,0,0,0.8);margin:0 0 16px;">
        Te adjunto el PDF con todo el detalle. Es válido para presentarlo y reclamar tu
        <strong>${QUOTE_DISCOUNT_PCT}% off permanente en mensualidad</strong> al contratar.
      </p>

      ${
        isAnnual
          ? `<div style="background:#ECD66E;border:3px solid #000;border-radius:10px;padding:16px;margin:16px 0;text-align:center;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#000;font-weight:900;margin:0 0 6px;">★ Plan anual · setup GRATIS ★</p>
        <p style="font-family:monospace;font-size:24px;font-weight:900;margin:0 0 4px;color:#000;">${formatMxn(annualPlan.totalAnnualMxn)} MXN</p>
        <p style="font-size:11px;color:rgba(0,0,0,0.7);margin:0;">12 meses incluidos · ahorras ${formatMxn(annualPlan.setupSavingsMxn)} MXN del setup</p>
      </div>

      <div style="background:#000;color:#FFF;border-radius:10px;padding:14px;margin:0 0 16px;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.6);font-weight:900;margin:0 0 4px;">Mensualidad equivalente</p>
        <p style="font-family:monospace;font-size:20px;font-weight:900;margin:0;">${formatMxn(discountedMonthly)} MXN / mes</p>
        <p style="font-size:11px;color:rgba(255,255,255,0.6);margin:4px 0 0;">Pagado anualmente · ${quote.selectionsCount} capacidades + babysit · renueva auto cada 12 meses</p>
      </div>`
          : `<div style="background:#000;color:#FFF;border-radius:10px;padding:16px;margin:16px 0;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#ECD66E;font-weight:900;margin:0 0 6px;">Setup único · pago una sola vez</p>
        <p style="font-family:monospace;font-size:24px;font-weight:900;margin:0 0 4px;">${formatMxn(quote.setupOneTimeMxn)} MXN</p>
        <p style="font-size:11px;color:rgba(255,255,255,0.6);margin:0;">Incluye 30 días de acompañamiento por WhatsApp con dos expertos en robots · setup técnico + MCPs + tu marca · 2 integraciones simples</p>
      </div>

      <div style="background:#ECD66E;border:2px solid #000;border-radius:10px;padding:14px;margin:0 0 16px;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:900;margin:0 0 4px;">Mensualidad con tu descuento</p>
        <p style="font-family:monospace;font-size:22px;font-weight:900;margin:0;color:#9870ED;">${formatMxn(discountedMonthly)} MXN / mes</p>
        <p style="font-size:11px;color:rgba(0,0,0,0.6);margin:4px 0 0;">${QUOTE_DISCOUNT_PCT}% off permanente · ${quote.selectionsCount} ${quote.selectionsCount === 1 ? "capacidad" : "capacidades"} + babysit</p>
      </div>`
      }

      <p style="font-size:13px;line-height:1.5;color:rgba(0,0,0,0.85);margin:16px 0 8px;">
        <strong>Siguiente paso:</strong> agendamos una llamada por WhatsApp para validar que
        encajamos. Si no, no hay deal — preferimos ser claros antes de cobrar.
      </p>

      <div style="text-align:center;margin:20px 0 8px;">
        <a href="https://wa.me/${QUIZ_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, soy ${lead.name}. Vi mi cotización ${folio} y quiero agendar discovery.`)}"
           style="display:inline-block;background:#000;color:#FFF;text-decoration:none;font-weight:900;padding:12px 24px;border-radius:10px;border:3px solid #000;font-size:15px;">
          Hablar por WhatsApp →
        </a>
      </div>
    </div>

    <p style="font-size:11px;color:rgba(0,0,0,0.5);margin:24px 0 0;text-align:center;">
      EasyBits · Agentes IA para tu negocio · www.easybits.cloud<br>
      Folio ${folio} · ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}
    </p>
  </div>
</body>
</html>`;
};

export type SendQuizQuotationOptions = {
  payload: QuizPdfPayload;
  // Optional: si quien llama ya generó folio, lo reutilizamos. Si no, generamos uno nuevo.
  folio?: string;
};

export type SendQuizQuotationResult = {
  ok: boolean;
  folio: string;
  error?: string;
};

export const sendQuizQuotation = async ({
  payload,
  folio: providedFolio,
}: SendQuizQuotationOptions): Promise<SendQuizQuotationResult> => {
  const folio = providedFolio || generateQuizFolio();
  try {
    const pdfBuffer = await renderQuizPdf(payload, folio);
    const html = buildQuotationEmailHtml(payload, folio);

    const isAnnualSubject =
      payload.billingMode === "annual" &&
      isAnnualPlanEligible(
        parseSelections(payload.selections || "").size
      );
    const subject = isAnnualSubject
      ? `Tu cotización anual EasyBits (setup gratis) — ${folio}`
      : `Tu cotización EasyBits — ${folio}`;
    await getSesTransport().sendMail({
      from: getSesRemitent(),
      to: payload.lead.email,
      subject,
      html,
      attachments: [
        {
          filename: `EasyBits-Cotizacion-${folio}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return { ok: true, folio };
  } catch (err) {
    console.error("[sendQuizQuotation] error", err);
    return {
      ok: false,
      folio,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
};
