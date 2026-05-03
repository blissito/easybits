import type { Route } from "./+types/document-from-cfdi";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createDocumentFromCFDI } from "~/.server/core/documentOperations";
import { parseCFDI } from "~/lib/cfdi/parseCFDI";
import { serializeCFDIForAI } from "~/lib/cfdi/templates";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateDocumentParallel } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { xml, theme, customColors, mode, extraInstructions } = body;

  if (!xml || typeof xml !== "string") {
    return Response.json({ error: "xml string required" }, { status: 400 });
  }

  // Template mode (default) — instant, no AI
  if (mode !== "ai") {
    try {
      const result = await createDocumentFromCFDI(ctx, { xml, theme, customColors });
      return Response.json(result);
    } catch (err) {
      if (err instanceof Response) throw err;
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed to parse CFDI" },
        { status: 400 }
      );
    }
  }

  // AI mode — parse XML, create empty doc, generate with AI
  let data;
  try {
    data = parseCFDI(xml);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to parse CFDI" },
      { status: 400 }
    );
  }

  // Check AI generation limit
  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) {
    return Response.json(
      { error: `Has usado todas tus ${genLimit.limit} créditos de este mes.`, upgradeUrl: "/dash/packs" },
      { status: 429 }
    );
  }

  // Create empty document
  const tipoNames: Record<string, string> = { I: "Factura", P: "Recibo de Pago", E: "Nota de Crédito", T: "Carta Porte", N: "Nómina" };
  const docName = `${tipoNames[data.tipo] || "CFDI"} — ${data.emisor.nombre || data.emisor.rfc}${data.serie || data.folio ? ` (${[data.serie, data.folio].filter(Boolean).join(" ")})` : ""}`;

  const metadata: Record<string, unknown> = {
    cfdi: { uuid: data.timbre?.uuid, tipo: data.tipo, emisorRfc: data.emisor.rfc, receptorRfc: data.receptor.rfc, total: data.total, moneda: data.moneda, fecha: data.fecha },
  };
  if (theme) metadata.theme = theme;
  if (customColors) metadata.customColors = customColors;

  const doc = await db.landing.create({
    data: {
      name: docName,
      prompt: `CFDI ${data.tipoDesc} — ${data.emisor.nombre} → ${data.receptor.nombre}`,
      sections: [],
      version: 4,
      theme: theme || "default",
      metadata: metadata as any,
      ownerId: ctx.user.id,
    },
  });

  // Serialize CFDI data for the AI
  const sourceContent = serializeCFDIForAI(data);
  const tipoLabel = tipoNames[data.tipo] || "documento fiscal";
  const prompt = `Diseña un ${tipoLabel} profesional con estos datos fiscales mexicanos (CFDI).

REGLA ABSOLUTA: Usa EXACTAMENTE los datos proporcionados. No inventes, modifiques ni redondees ningún valor — son datos fiscales legales. Todos los números, RFCs, UUIDs y fechas deben aparecer tal cual.

Incluye: datos del emisor, datos del receptor, ${data.tipo === "P" ? "detalle de pagos y documentos relacionados" : "tabla de conceptos con cantidades/precios"}, desglose de impuestos, totales, y sección de timbre fiscal digital (UUID, sellos truncados).

${data.qrUrl ? `Al final incluye el link de verificación SAT: ${data.qrUrl}` : ""}${extraInstructions ? `\n\nInstrucciones adicionales del usuario: ${extraInstructions}` : ""}`;

  // Resolve AI keys/models
  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;
  const docModelId = await getAiModel("docGenerate");
  const docModel = resolveModelLocal(docModelId, openaiKey || undefined, userKey || undefined);
  const outlineModelId = await getAiModel("docDirections");
  const outlineModel = resolveModelLocal(outlineModelId, openaiKey || undefined, userKey || undefined);

  let quotaIncremented = false;
  const startTime = Date.now();
  let usageTokens = { inputTokens: 0, outputTokens: 0 };
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

      // Send doc info first so client knows the doc ID
      send("doc-created", { id: doc.id, name: docName, cfdiData: data });

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
          onUsage(usage: any) {
            usageTokens = usage;
          },
          onImageUpdate(sectionId: string, html: string) {
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            if (!quotaIncremented) {
              quotaIncremented = true;
              await incrementAiGeneration(ctx.user.id, undefined, {
                type: "generate",
                product: "document",
                modelId: docModelId,
                inputTokens: usageTokens.inputTokens,
                outputTokens: usageTokens.outputTokens,
                resourceId: doc.id,
                pageCount: allSections.length,
                durationMs: Date.now() - startTime,
              });
            }
            if (allSections.length > 0) {
              allSections.sort((a, b) => a.order - b.order);
              await db.landing.update({
                where: { id: doc.id },
                data: { sections: allSections as any },
              });
            }
            send("done", { total: allSections.length, docId: doc.id });
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
