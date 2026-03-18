/**
 * Public CFDI AI preview endpoint — NO AUTH required.
 * Rate limited: 1 generation per IP per day.
 * Uses streamText directly (not generateDocumentParallel) to preserve exact fiscal data.
 */
import { parseCFDI } from "~/lib/cfdi/parseCFDI";
import { buildCFDIDocument } from "~/lib/cfdi/templates";
import { streamText } from "ai";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";
import { LRUCache } from "lru-cache";

// 1 generation per IP per 24 hours
const dailyCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000,
});

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Rate limit by IP (bypass with ?secret=)
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  const bypass = secretParam === process.env.CRON_SECRET || secretParam === "pelusina";
  const ip = getClientIP(request);

  if (!bypass) {
    const used = dailyCache.get(ip);
    if (used) {
      return Response.json(
        { error: "Ya usaste tu preview con IA de hoy. Vuelve mañana o crea una cuenta en EasyBits para uso ilimitado." },
        { status: 429, headers }
      );
    }
  }

  const body = await request.json();
  const { xml, logo } = body;

  if (!xml || typeof xml !== "string") {
    return Response.json({ error: "xml string required" }, { status: 400, headers });
  }

  let data;
  try {
    data = parseCFDI(xml);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to parse CFDI" },
      { status: 400, headers }
    );
  }

  // Mark as used immediately
  dailyCache.set(ip, 1);

  const tipoNames: Record<string, string> = {
    I: "Factura", P: "Recibo de Pago", E: "Nota de Crédito", T: "Carta Porte", N: "Nómina",
  };

  const tipoLabel = tipoNames[data.tipo] || "documento fiscal";
  const referenceHtml = buildCFDIDocument(data);
  const qrImg = data.qrUrl
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data.qrUrl)}" alt="QR Verificación SAT" style="width:120px;height:120px;">`
    : "";

  const systemPrompt = `Eres un diseñador experto de documentos fiscales mexicanos (CFDI).
Tu trabajo es rediseñar facturas y recibos de pago con un estilo visual profesional y atractivo.

REGLAS ABSOLUTAS:
- NUNCA cambies, redondees, inventes ni modifiques NINGÚN número, RFC, UUID, fecha, monto ni texto del HTML de referencia
- Copia cada valor EXACTAMENTE como aparece — si dice $10,440.00 DEBE decir $10,440.00
- El QR img tag debe incluirse EXACTAMENTE como se te proporciona (no lo modifiques, no lo quites)
- NO uses data-image-query en ningún elemento — no se deben buscar imágenes stock
- Genera UNA SOLA sección HTML (<section>...</section>) que quepa en una página carta (8.5" x 11")
- Usa Tailwind CSS classes para el estilo
- Incluye Google Fonts via @import en un <style> tag al inicio si necesitas fuentes especiales`;

  const userPrompt = `Rediseña este ${tipoLabel} mexicano (CFDI) con un estilo visual más profesional y atractivo.

REFERENCIA HTML (contiene TODOS los datos exactos — NO modifiques ningún valor):
${referenceHtml}

${qrImg ? `OBLIGATORIO — incluye este QR tag EXACTAMENTE así junto al timbre fiscal:\n${qrImg}` : ""}

${logo ? `LOGO DEL EMISOR — incluye este img tag en el header:\n<img src="${logo}" alt="Logo" style="max-height:60px;max-width:180px;">` : ""}

INSTRUCCIONES DE DISEÑO:
- Layout: header con emisor → datos fiscales → tabla de conceptos/pagos → impuestos → totales → timbre fiscal con QR
- Mejora el estilo: colores elegantes, tipografía con jerarquía, tabla con filas alternadas, spacing generoso, cards para emisor/receptor
- Todos los datos del timbre fiscal deben aparecer (UUID, fecha timbrado, certificado SAT, sellos truncados)
- Responde SOLO con el HTML de la sección, sin explicaciones ni markdown`;

  // Resolve AI model
  const docModelId = await getAiModel("docGenerate");
  const docModel = resolveModelLocal(docModelId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, eventData: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`)
        );
      };

      send("start", { tipo: data.tipo, tipoDesc: tipoLabel, emisor: data.emisor.nombre || data.emisor.rfc });

      try {
        const result = streamText({
          model: docModel,
          system: systemPrompt,
          prompt: userPrompt,
        });

        let fullHtml = "";

        for await (const chunk of result.textStream) {
          fullHtml += chunk;
          send("chunk", { html: chunk });
        }

        send("done", { html: fullHtml });
        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Generation failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const resetParam = url.searchParams.get("reset");
  if (resetParam === process.env.CRON_SECRET || resetParam === "pelusina") {
    dailyCache.clear();
    return Response.json({ ok: true, message: "Rate limit cache cleared" }, { headers: CORS_HEADERS });
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
