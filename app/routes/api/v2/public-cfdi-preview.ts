/**
 * Public CFDI AI preview endpoint — NO AUTH required.
 * Rate limited: 1 generation per IP per day.
 * ⚠️ TEMPORARY — disable after demos.
 */
import { parseCFDI } from "~/lib/cfdi/parseCFDI";
import { serializeCFDIForAI } from "~/lib/cfdi/templates";
import { generateDocumentParallel } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";
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

  // CORS for landing page
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
  const { xml } = body;

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

  const sourceContent = serializeCFDIForAI(data);
  const tipoLabel = tipoNames[data.tipo] || "documento fiscal";
  const prompt = `Diseña un ${tipoLabel} con un diseño ÚNICO, PREMIUM y VISUALMENTE IMPACTANTE. Este NO es un documento genérico — debe verse como diseñado por un estudio de branding profesional.

DIRECCIÓN CREATIVA:
- Usa un esquema de color audaz y moderno (NO gris/blanco aburrido). Elige una paleta con personalidad: gradientes sutiles, acentos vibrantes, fondos con textura o color.
- Tipografía con jerarquía clara: títulos grandes y bold, datos en fuentes limpias.
- Layout sofisticado: usa cards con sombras, bordes redondeados, iconos decorativos (emoji), separadores con estilo, badges para datos clave.
- Header impactante: nombre del emisor grande y prominente, tipo de documento como badge de color, serie/folio destacados.
- Tabla de ${data.tipo === "P" ? "documentos relacionados" : "conceptos"}: con filas alternadas de color, headers con fondo de color, bordes suaves.
- Totales: sección destacada con fondo de color y tipografía grande.
- Sección de timbre fiscal: diseño compacto pero completo con todos los datos del timbre (UUID, fecha timbrado, no. certificado SAT, sellos CFDI y SAT truncados a primeros y últimos 8 caracteres).

${data.qrUrl ? `OBLIGATORIO — CÓDIGO QR: Incluye esta imagen QR de verificación SAT junto al timbre fiscal:
<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.qrUrl)}" alt="QR Verificación SAT" style="width:150px;height:150px;">
El QR debe ser visible y estar junto a los datos del timbre.` : ""}

REGLA ABSOLUTA: Usa EXACTAMENTE los datos proporcionados. No inventes, modifiques ni redondees NINGÚN valor — son datos fiscales legales. Todos los números, RFCs, UUIDs y fechas deben aparecer tal cual.

Incluye: datos del emisor, datos del receptor, ${data.tipo === "P" ? "detalle de pagos y documentos relacionados con parcialidades" : "tabla de conceptos con cantidades/precios"}, desglose de impuestos, totales, y sección completa de timbre fiscal digital.`;

  // Resolve AI models (platform keys, no user key needed)
  const docModelId = await getAiModel("docGenerate");
  const docModel = resolveModelLocal(docModelId);
  const outlineModelId = await getAiModel("docDirections");
  const outlineModel = resolveModelLocal(outlineModelId);

  const allSections: Section3[] = [];
  const fullPrompt = `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 15000)}\n\nInstructions: ${prompt}`;

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
        await generateDocumentParallel({
          prompt: fullPrompt,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          model: docModel,
          outlineModel,
          pageCount: data.tipo === "P" ? 1 : undefined,
          skipCover: false,
          pageFormat: "letter",
          onOutline(outline) {
            send("outline", { pages: outline.pages.map((p: any) => ({ pageNumber: p.pageNumber, label: p.label, type: p.type })) });
          },
          onPageChunk(pageIndex: number, html: string) {
            send("section-building", { html, order: pageIndex });
          },
          async onPageComplete(pageIndex: number, section: Section3) {
            allSections.push(section);
            send("section", section);
          },
          onImageUpdate(sectionId: string, html: string) {
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            allSections.sort((a, b) => a.order - b.order);
            send("done", { total: allSections.length });
            controller.close();
          },
          onError(err: Error) {
            send("error", { message: err.message || "Generation failed" });
            controller.close();
          },
        });
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

// Handle CORS preflight + GET with ?reset= to clear cache
export async function loader({ request }: { request: Request }) {
  // Always return CORS headers on GET (covers OPTIONS preflight via React Router)
  const url = new URL(request.url);
  const resetParam = url.searchParams.get("reset");
  if (resetParam === process.env.CRON_SECRET || resetParam === "pelusina") {
    dailyCache.clear();
    return Response.json({ ok: true, message: "Rate limit cache cleared" }, { headers: CORS_HEADERS });
  }

  // For any other GET or OPTIONS, return CORS preflight response
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
