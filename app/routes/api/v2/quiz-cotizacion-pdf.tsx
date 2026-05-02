import type { Route } from "./+types/quiz-cotizacion-pdf";
import {
  generateQuizFolio,
  renderQuizPdf,
  type QuizPdfPayload,
} from "~/.server/quiz/pdf";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: QuizPdfPayload;
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

  const folio = generateQuizFolio();

  try {
    const pdfBuffer = await renderQuizPdf(payload, folio);
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
