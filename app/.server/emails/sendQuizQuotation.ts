import {
  generateQuizFolio,
  renderQuizPdf,
  type QuizPdfPayload,
} from "~/.server/quiz/pdf";
import { QUIZ_WHATSAPP_NUMBER } from "~/lib/quiz/contact";
import {
  computeAnnualFromMonthly,
  computeQuote,
  formatMxn,
  parseSelections,
} from "~/lib/quiz/pricing";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getSesRemitent, getSesTransport } from "./sendgridTransport";

const buildQuotationEmailHtml = (
  payload: QuizPdfPayload,
  folio: string
): string => {
  const { lead } = payload;
  const selectionsMap = parseSelections(payload.selections || "");
  const planKey: PlanKey = (payload.plan as PlanKey) || "Mega";
  const quote = computeQuote(selectionsMap, !!payload.customIntegrations, planKey);
  const planSupportsAnnual = planKey !== "Byte" && PLANS[planKey].price > 0;
  const billingMode = payload.planBilling ?? payload.billingMode;
  const isAnnual = planSupportsAnnual && billingMode === "annual";
  const planMonthly = quote.monthlyTotalMxn;
  const planAnnual = computeAnnualFromMonthly(planMonthly);

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
        Te adjunto el PDF con todo el detalle. Los mismos dos números que verás al pagar.
      </p>

      <div style="background:#000;color:#FFF;border-radius:10px;padding:16px;margin:16px 0;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#ECD66E;font-weight:900;margin:0 0 6px;">Setup único · pago una sola vez</p>
        <p style="font-family:monospace;font-size:24px;font-weight:900;margin:0 0 4px;">${formatMxn(quote.setupOneTimeMxn)} MXN</p>
        <p style="font-size:11px;color:rgba(255,255,255,0.6);margin:0;">${quote.selectionsCount} ${quote.selectionsCount === 1 ? "capacidad" : "capacidades"} armadas · 30 días de acompañamiento por WhatsApp · setup técnico + MCPs + tu marca</p>
      </div>

      <div style="background:#ECD66E;border:2px solid #000;border-radius:10px;padding:14px;margin:0 0 16px;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:900;margin:0 0 4px;">Plan ${planKey} · ${isAnnual ? "anual" : "mensual"}</p>
        <p style="font-family:monospace;font-size:22px;font-weight:900;margin:0;color:#9870ED;">${planMonthly === 0 ? "Gratis" : isAnnual ? `${formatMxn(planAnnual)} MXN / año` : `${formatMxn(planMonthly)} MXN / mes`}</p>
        ${isAnnual ? `<p style="font-size:11px;color:rgba(0,0,0,0.6);margin:4px 0 0;">≈ ${formatMxn(Math.round(planAnnual / 12))} MXN al mes · 2 meses gratis</p>` : ""}
      </div>

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

    const subject = `Tu cotización EasyBits — ${folio}`;
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
